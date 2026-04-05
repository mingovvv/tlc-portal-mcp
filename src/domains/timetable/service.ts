import { randomUUID } from "node:crypto";
import type { PortalAuthManager } from "../../core/auth.js";
import type { PortalConfig } from "../../core/config.js";
import {
  PreparedTimetableEntryNotFoundError,
  TimetableValidationError,
} from "../../core/errors.js";
import type { PortalHttpClient } from "../../core/http-client.js";
import type {
  PreparedBulkEntry,
  PreparedBulkEntryDay,
  PreparedDayEntry,
  TimetableDayCapacity,
  TimetableDayRecord,
  TimetableProject,
  TimetableRangeOverviewDay,
  TimetableRowInput,
  TimetableTaskType,
} from "./models.js";
import { TimetableTaskType as TaskType } from "./models.js";
import { resolveNonWorkingDay } from "./non-working-day.js";

type VacationRecord = {
  vacationRequestId: number | string;
  startDt: string;
  endDt: string;
  vacationType: string;
  stat: string;
};

type TimetableUserRow = {
  workDate: string;
  projectId?: number;
  projectName?: string;
  taskType: string;
  workTime: number;
  note?: string | null;
};

const FULL_DAY_VACATION_TYPES = new Set(["allDay", "admit"]);
const HALF_DAY_VACATION_TYPES = new Set(["AM", "PM", "admitAm", "admitPm"]);
const ACTIVE_VACATION_STATUSES = new Set(["applied", "approved", "inProgress"]);

export class TimetableService {
  private preparedDayEntries = new Map<string, PreparedDayEntry>();
  private preparedBulkEntries = new Map<string, PreparedBulkEntry>();

  constructor(
    private readonly config: PortalConfig,
    private readonly http: PortalHttpClient,
    private readonly auth: PortalAuthManager
  ) {}

  async getManageInfo(): Promise<unknown> {
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.get("/api/attendance-svc/timetable/manage", session);
    const payload = (await res.json()) as { data?: unknown };
    return payload.data ?? payload;
  }

  async getUserSummary(): Promise<{ list: TimetableUserRow[] }> {
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.get("/api/attendance-svc/timetable/user", session);
    const payload = (await res.json()) as {
      data?: { list?: Array<Record<string, unknown>> };
    };
    const list = payload.data?.list ?? [];
    return {
      list: list.map((row) => this.mapTimetableRow(row)),
    };
  }

  async getAvailableRange(): Promise<unknown> {
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.get(
      "/api/attendance-svc/timetable/manage/available",
      session
    );
    const payload = (await res.json()) as { data?: unknown };
    return payload.data ?? payload;
  }

  async getDay(workDate: string): Promise<TimetableDayRecord> {
    this.validateDate(workDate);
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.get(`/api/attendance-svc/timetable/${workDate}`, session);
    const payload = (await res.json()) as {
      data?: { list?: Array<Record<string, unknown>> };
    };
    const list = payload.data?.list ?? [];

    return {
      workDate,
      rows: list.map((row) => ({
        workDate: String(row["workDate"] ?? workDate),
        projectId:
          row["projectId"] === null || row["projectId"] === undefined
            ? undefined
            : Number(row["projectId"]),
        projectName: row["projectName"] ? String(row["projectName"]) : undefined,
        taskType: String(row["taskType"] ?? ""),
        workTime: Number(row["workTime"] ?? 0),
        note: row["note"] ? String(row["note"]) : null,
      })),
    };
  }

  async getRangeOverview(
    startDate: string,
    endDate: string
  ): Promise<{
    startDate: string;
    endDate: string;
    days: TimetableRangeOverviewDay[];
  }> {
    this.validateDate(startDate);
    this.validateDate(endDate);
    if (startDate > endDate) {
      throw new TimetableValidationError("startDate cannot be later than endDate.");
    }

    const dates = this.enumerateDates(startDate, endDate);
    const summary = await this.getUserSummary();
    const overlayVacations = await this.listVacationOverlayRequests();
    const rowsByDate = new Map<string, TimetableUserRow[]>();
    for (const row of summary.list) {
      if (row.workDate < startDate || row.workDate > endDate) continue;
      const existing = rowsByDate.get(row.workDate) ?? [];
      existing.push(row);
      rowsByDate.set(row.workDate, existing);
    }
    const days: TimetableRangeOverviewDay[] = [];

    for (const workDate of dates) {
      const capacity = await this.getDayCapacity(workDate, overlayVacations);
      const dayRows = rowsByDate.get(workDate) ?? [];
      const totalWorkTime = dayRows.reduce((sum, row) => sum + row.workTime, 0);
      const projectNames = Array.from(
        new Set(
          dayRows
            .map((row) => row.projectName)
            .filter((value): value is string => Boolean(value))
        )
      );
      const taskTypes = Array.from(
        new Set(
          dayRows
            .map((row) => row.taskType)
            .filter((value): value is string => Boolean(value))
        )
      );

      days.push({
        workDate,
        dayType: capacity.dayType,
        holidayName: capacity.holidayName,
        canWrite: capacity.canWrite,
        maxWorkTime: capacity.maxWorkTime,
        rowCount: dayRows.length,
        totalWorkTime,
        hasEntry: dayRows.length > 0,
        projectNames,
        taskTypes,
        noteCount: dayRows.filter((row) => Boolean(row.note)).length,
        reason: capacity.reason,
      });
    }

    return {
      startDate,
      endDate,
      days,
    };
  }

  async listProjects(limit = 999999): Promise<TimetableProject[]> {
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.get(
      `/api/project-svc/project/summary?limit=${limit}`,
      session
    );
    const payload = (await res.json()) as Record<string, unknown>;
    const result = this.extractProjectSummaryItems(payload);

    const projects = result.map((item) => ({
      projectId: Number(item["value"] ?? item["projectId"] ?? item["id"]),
      projectName: String(item["label"] ?? item["projectName"] ?? item["name"] ?? ""),
      projectCode: item["projectCode"] ? String(item["projectCode"]) : undefined,
      projectStatus: item["projectStatus"]
        ? String(item["projectStatus"])
        : undefined,
      projectType: item["projectType"] ? String(item["projectType"]) : undefined,
      source: "project_summary" as const,
    })).filter((item) => Number.isFinite(item.projectId) && item.projectName);

    if (projects.length > 0) {
      return projects;
    }

    const summary = await this.getUserSummary();
    const fallbackProjects = new Map<number, TimetableProject>();
    for (const row of summary.list) {
      if (row.projectId === undefined || !row.projectName) {
        continue;
      }
      if (fallbackProjects.has(row.projectId)) {
        continue;
      }
      fallbackProjects.set(row.projectId, {
        projectId: row.projectId,
        projectName: row.projectName,
        source: "user_summary_fallback",
      });
    }

    return Array.from(fallbackProjects.values()).sort((a, b) =>
      a.projectName.localeCompare(b.projectName, "ko")
    );
  }

  async getDayCapacity(
    workDate: string,
    overlayVacations?: VacationRecord[]
  ): Promise<TimetableDayCapacity> {
    this.validateDate(workDate);

    const nonWorkingDay = await resolveNonWorkingDay(workDate, this.config);
    if (nonWorkingDay) {
      return {
        workDate,
        dayType: nonWorkingDay.kind,
        maxWorkTime: 0,
        leaveType: "none",
        holidayName: nonWorkingDay.name,
        leaveRequests: [],
        vacationOverlaySource: "calendar",
        canWrite: false,
        reason:
          nonWorkingDay.kind === "weekend"
            ? `Weekend (${nonWorkingDay.name})`
            : `${nonWorkingDay.kind === "public_holiday" ? "Public holiday" : "Company closure"}: ${nonWorkingDay.name}`,
      };
    }

    const vacations = overlayVacations ?? (await this.listVacationOverlayRequests());
    const dayVacations = vacations.filter(
      (item) =>
        ACTIVE_VACATION_STATUSES.has(item.stat) &&
        this.isDateOverlapping(item.startDt, item.endDt, workDate)
    );

    const hasFullDay = dayVacations.some((item) =>
      FULL_DAY_VACATION_TYPES.has(item.vacationType)
    );
    if (hasFullDay) {
      return {
        workDate,
        dayType: "full_day_leave",
        maxWorkTime: 0,
        leaveType: "full_day",
        leaveRequests: dayVacations.map(this.mapCapacityVacation),
        vacationOverlaySource: "vacation.request.secure.sort=requestDt",
        canWrite: false,
        reason: "Full-day leave exists for this date.",
      };
    }

    const hasHalfDay = dayVacations.some((item) =>
      HALF_DAY_VACATION_TYPES.has(item.vacationType)
    );

    return {
      workDate,
      dayType: hasHalfDay ? "half_day_leave" : "workday",
      maxWorkTime: hasHalfDay ? 4 : 8,
      leaveType: hasHalfDay ? "half_day" : "none",
      leaveRequests: dayVacations.map(this.mapCapacityVacation),
      vacationOverlaySource: "vacation.request.secure.sort=requestDt",
      canWrite: true,
      reason: hasHalfDay ? "Half-day leave exists. Maximum writable time is 4 hours." : undefined,
    };
  }

  async prepareDayEntry(input: {
    workDate: string;
    rows: TimetableRowInput[];
  }): Promise<PreparedDayEntry> {
    this.validateDate(input.workDate);
    const rows = await this.normalizeRows(input.rows);
    const capacity = await this.getDayCapacity(input.workDate);
    const totalWorkTime = rows.reduce((sum, row) => sum + row.workTime, 0);

    this.validateRowsAgainstCapacity(totalWorkTime, capacity);

    const prepared: PreparedDayEntry = {
      preparedEntryId: randomUUID(),
      workDate: input.workDate,
      rows,
      totalWorkTime,
      capacity,
      validationMessages: [
        `Validated against a daily capacity of ${capacity.maxWorkTime} hours.`,
      ],
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    this.preparedDayEntries.set(prepared.preparedEntryId, prepared);
    return prepared;
  }

  async submitPreparedDayEntry(preparedEntryId: string): Promise<Record<string, unknown>> {
    const session = await this.auth.ensureAuthenticatedSession();
    const prepared = this.preparedDayEntries.get(preparedEntryId);
    if (!prepared) {
      throw new PreparedTimetableEntryNotFoundError(
        `Prepared timetable entry not found: ${preparedEntryId}`
      );
    }

    const capacity = await this.getDayCapacity(prepared.workDate);
    this.validateRowsAgainstCapacity(prepared.totalWorkTime, capacity);

    await this.http.post(
      "/api/attendance-svc/timetable",
      {
        workDate: prepared.workDate,
        timetableRows: prepared.rows.map((row) => this.toSubmitRow(row)),
      },
      session
    );

    return {
      submitted: true,
      workDate: prepared.workDate,
      totalWorkTime: prepared.totalWorkTime,
      rowCount: prepared.rows.length,
      capacity,
    };
  }

  async prepareBulkEntries(input: {
    startDate: string;
    endDate: string;
    rows: TimetableRowInput[];
  }): Promise<PreparedBulkEntry> {
    this.validateDate(input.startDate);
    this.validateDate(input.endDate);
    if (input.startDate > input.endDate) {
      throw new TimetableValidationError("startDate cannot be later than endDate.");
    }

    const normalizedRows = await this.normalizeRows(input.rows);
    const totalWorkTime = normalizedRows.reduce((sum, row) => sum + row.workTime, 0);
    const dates = this.enumerateDates(input.startDate, input.endDate);
    const days: PreparedBulkEntryDay[] = [];

    for (const workDate of dates) {
      const capacity = await this.getDayCapacity(workDate);
      this.validateRowsAgainstCapacity(totalWorkTime, capacity);
      days.push({
        workDate,
        rows: normalizedRows,
        totalWorkTime,
        capacity,
      });
    }

    const prepared: PreparedBulkEntry = {
      preparedEntryId: randomUUID(),
      days,
      validationMessages: [`Prepared bulk entry for ${days.length} day(s).`],
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    };

    this.preparedBulkEntries.set(prepared.preparedEntryId, prepared);
    return prepared;
  }

  async submitPreparedBulkEntries(
    preparedEntryId: string
  ): Promise<Record<string, unknown>> {
    const session = await this.auth.ensureAuthenticatedSession();
    const prepared = this.preparedBulkEntries.get(preparedEntryId);
    if (!prepared) {
      throw new PreparedTimetableEntryNotFoundError(
        `Prepared bulk timetable entry not found: ${preparedEntryId}`
      );
    }

    const list = [];
    for (const day of prepared.days) {
      const capacity = await this.getDayCapacity(day.workDate);
      this.validateRowsAgainstCapacity(day.totalWorkTime, capacity);
      list.push({
        workDate: day.workDate,
        timetableRows: day.rows.map((row) => ({
          workDate: day.workDate,
          ...this.toSubmitRow(row),
        })),
      });
    }

    await this.http.post("/api/attendance-svc/timetable/list", list, session);

    return {
      submitted: true,
      dayCount: prepared.days.length,
      workDates: prepared.days.map((day) => day.workDate),
    };
  }

  async clearDay(workDate: string): Promise<Record<string, unknown>> {
    this.validateDate(workDate);
    const session = await this.auth.ensureAuthenticatedSession();
    await this.http.post(
      "/api/attendance-svc/timetable",
      { workDate, timetableRows: [] },
      session
    );

    return {
      cleared: true,
      workDate,
    };
  }

  private async normalizeRows(rows: TimetableRowInput[]) {
    if (rows.length === 0) {
      throw new TimetableValidationError("At least one timetable row is required.");
    }

    const projects = await this.listProjects();
    const projectMap = new Map(projects.map((project) => [project.projectId, project]));

    return rows.map((row) => {
      this.validateTaskType(row.taskType);
      if (row.workTime <= 0) {
        throw new TimetableValidationError("workTime must be greater than 0.");
      }

      if (row.taskType === TaskType.NORMAL) {
        return {
          taskType: row.taskType,
          workTime: row.workTime,
          note: row.note,
        };
      }

      if (row.projectId === undefined || row.projectId === null) {
        throw new TimetableValidationError(
          `${row.taskType} rows require a projectId.`
        );
      }

      const project = projectMap.get(row.projectId);
      if (!project) {
        throw new TimetableValidationError(
          `Project not found or not selectable: ${row.projectId}`
        );
      }

      return {
        taskType: row.taskType,
        workTime: row.workTime,
        projectId: row.projectId,
        projectName: project.projectName,
        note: row.note,
      };
    });
  }

  private validateRowsAgainstCapacity(
    totalWorkTime: number,
    capacity: TimetableDayCapacity
  ) {
    if (!capacity.canWrite) {
      throw new TimetableValidationError(
        capacity.reason ?? "This date is not writable."
      );
    }
    if (totalWorkTime > capacity.maxWorkTime) {
      throw new TimetableValidationError(
        `Input time ${totalWorkTime} exceeds daily capacity ${capacity.maxWorkTime}.`
      );
    }
  }

  private toSubmitRow(row: {
    taskType: TimetableTaskType;
    workTime: number;
    projectId?: number;
    note?: string;
  }) {
    return {
      ...(row.projectId !== undefined ? { projectId: row.projectId } : {}),
      taskType: row.taskType,
      workTime: row.workTime,
      ...(row.note ? { note: row.note } : {}),
    };
  }

  private async listVacationOverlayRequests() {
    const session = await this.auth.ensureAuthenticatedSession();
    const employeeId = session.employeeId;
    if (!employeeId) {
      throw new TimetableValidationError(
        "employeeId is required to resolve timetable capacity."
      );
    }

    const params = new URLSearchParams({
      "employeeId.employeeId": String(employeeId),
      sort: "requestDt",
      order: "DESC",
      limit: "1000",
      offset: "0",
    });

    const res = await this.http.get(
      `/api/vacation-svc/request/secure?${params}`,
      session
    );
    const payload = (await res.json()) as {
      data?: { list?: VacationRecord[] };
    };
    return (payload.data?.list ?? []).filter(
      (item) => item && item.stat !== "cancel" && item.stat !== "reject"
    );
  }

  private validateDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new TimetableValidationError(`Invalid date format: ${value}`);
    }
  }

  private validateTaskType(taskType: string) {
    if (!Object.values(TaskType).includes(taskType as TimetableTaskType)) {
      throw new TimetableValidationError(`Unsupported taskType: ${taskType}`);
    }
  }

  private enumerateDates(startDate: string, endDate: string) {
    const dates: string[] = [];
    const cursor = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    while (cursor.getTime() <= end.getTime()) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, "0");
      const d = String(cursor.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      cursor.setDate(cursor.getDate() + 1);
    }
    return dates;
  }

  private isDateOverlapping(startDate: string, endDate: string, targetDate: string) {
    return startDate <= targetDate && targetDate <= endDate;
  }

  private mapCapacityVacation(item: VacationRecord) {
    return {
      requestId: String(item.vacationRequestId),
      startDate: item.startDt,
      endDate: item.endDt,
      portalVacationType: item.vacationType,
      status: item.stat,
    };
  }

  private mapTimetableRow(row: Record<string, unknown>): TimetableUserRow {
    return {
      workDate: String(row["workDate"] ?? ""),
      projectId:
        row["projectId"] === null || row["projectId"] === undefined
          ? undefined
          : Number(row["projectId"]),
      projectName: row["projectName"] ? String(row["projectName"]) : undefined,
      taskType: String(row["taskType"] ?? ""),
      workTime: Number(row["workTime"] ?? 0),
      note: row["note"] ? String(row["note"]) : null,
    };
  }

  private extractProjectSummaryItems(
    payload: Record<string, unknown>
  ): Array<Record<string, unknown>> {
    const candidates: unknown[] = [
      payload["data"],
      payload["result"],
      payload["list"],
      payload,
    ];

    const nestedData =
      payload["data"] && typeof payload["data"] === "object"
        ? (payload["data"] as Record<string, unknown>)
        : undefined;

    if (nestedData) {
      candidates.unshift(
        nestedData["result"],
        nestedData["list"],
        nestedData["content"],
        nestedData["items"]
      );
    }

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter(
          (item): item is Record<string, unknown> =>
            Boolean(item) && typeof item === "object"
        );
      }
    }

    return [];
  }
}
