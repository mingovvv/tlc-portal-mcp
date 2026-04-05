/**
 * 휴가 도메인 서비스.
 * 포탈 API를 직접 호출하는 비즈니스 로직 계층.
 */

import { randomUUID } from "node:crypto";
import type { PortalAuthManager } from "../../core/auth.js";
import type { PortalConfig } from "../../core/config.js";
import {
  LeaveValidationError,
  PreparedRequestNotFoundError,
} from "../../core/errors.js";
import type { PortalHttpClient } from "../../core/http-client.js";
import {
  LeaveRequestStatus,
  LeaveUnit,
  PortalVacationType,
  type CancelLeaveResult,
  type LeaveBalance,
  type LeaveRequestInput,
  type LeaveRequestQuery,
  type LeaveRequestRecord,
  type LeaveType,
  type PreparedLeaveRequest,
  type SubmitLeaveResult,
} from "./models.js";

export class LeaveService {
  private preparedRequests = new Map<string, PreparedLeaveRequest>();

  private static normalizeStatuses(statuses?: string[]): string[] {
    const aliasMap: Record<string, string> = {
      pending: "applied",
      requested: "applied",
      request: "applied",
      completed: "approved",
      done: "approved",
      rejected: "reject",
      cancelled: "cancel",
      canceled: "cancel",
    };

    const normalized = (statuses ?? ["applied", "inProgress"])
      .map((status) => aliasMap[status] ?? status)
      .filter(Boolean);

    return Array.from(new Set(normalized));
  }

  constructor(
    private readonly config: PortalConfig,
    private readonly http: PortalHttpClient,
    private readonly auth: PortalAuthManager
  ) {}

  listLeaveTypes(): LeaveType[] {
    return [
      {
        code: "annual",
        name: "연차",
        portalValue: PortalVacationType.ALL_DAY,
        supportsHalfDay: true,
        requiresReason: false,
      },
      {
        code: "morning_half",
        name: "오전반차",
        portalValue: PortalVacationType.MORNING_HALF,
        supportsHalfDay: true,
        requiresReason: false,
      },
      {
        code: "afternoon_half",
        name: "오후반차",
        portalValue: PortalVacationType.AFTERNOON_HALF,
        supportsHalfDay: true,
        requiresReason: false,
      },
      {
        code: "admit",
        name: "인정휴가",
        portalValue: PortalVacationType.ADMIT,
        supportsHalfDay: false,
        requiresReason: true,
      },
    ];
  }

  async getLeaveBalances(): Promise<LeaveBalance[]> {
    const session = await this.auth.ensureAuthenticatedSession();
    const employeeId = session.employeeId;
    if (!employeeId) {
      throw new LeaveValidationError(
        "세션에 employeeId가 없습니다. 다시 로그인해주세요."
      );
    }

    const res = await this.http.get(
      `/api/vacation-svc/manage/${employeeId}`,
      session
    );
    const payload = (await res.json()) as {
      data: {
        result: {
          allYear: number;
          useYear: number;
          useAdmit: number;
          useSum: number;
          residualYear: number;
          residualAdmit: number;
          residualSum: number;
        };
      };
    };
    const r = payload.data.result;

    return [
      {
        leaveTypeCode: "annual",
        leaveTypeName: "연차",
        totalDays: r.allYear,
        usedDays: r.useYear,
        remainingDays: r.residualYear,
      },
      {
        leaveTypeCode: "admit",
        leaveTypeName: "인정휴가",
        totalDays: r.useAdmit + r.residualAdmit,
        usedDays: r.useAdmit,
        remainingDays: r.residualAdmit,
      },
      {
        leaveTypeCode: "total",
        leaveTypeName: "전체 잔여",
        totalDays: r.useSum + r.residualSum,
        usedDays: r.useSum,
        remainingDays: r.residualSum,
      },
    ];
  }

  async listRequests(query?: Partial<LeaveRequestQuery>): Promise<LeaveRequestRecord[]> {
    const session = await this.auth.ensureAuthenticatedSession();
    const employeeId = session.employeeId;
    if (!employeeId) {
      throw new LeaveValidationError(
        "세션에 employeeId가 없습니다. 다시 로그인해주세요."
      );
    }

    const today = new Date();
    const q: LeaveRequestQuery = {
      employeeId,
      statuses: LeaveService.normalizeStatuses(query?.statuses),
      sort: query?.sort ?? "startDt",
      order: query?.order ?? "DESC",
      dateKey: query?.dateKey ?? "startDt",
      fromDate: query?.fromDate ?? `${today.getFullYear()}-01-01`,
      toDate: query?.toDate ?? `${today.getFullYear()}-12-31`,
      limit: query?.limit ?? 10,
      offset: query?.offset ?? 0,
    };

    const params = new URLSearchParams({
      sort: q.sort,
      "employeeId.employeeId": String(q.employeeId),
      order: q.order,
      dateKey: q.dateKey,
      stat: q.statuses.join(","),
      limit: String(q.limit),
      offset: String(q.offset),
    });
    if (q.fromDate) params.set("from", q.fromDate);
    if (q.toDate) params.set("to", q.toDate);

    const res = await this.http.get(
      `/api/vacation-svc/request/secure?${params}`,
      session
    );
    const payload = (await res.json()) as {
      data?: { list?: Record<string, unknown>[] };
      status?: string;
      statusCode?: number;
      message?: string;
    };

    if (!payload.data?.list) {
      throw new LeaveValidationError(
        payload.message ??
          `Unexpected leave response shape (status=${payload.status ?? "unknown"}, statusCode=${payload.statusCode ?? "unknown"}).`
      );
    }

    return payload.data.list.map(this.mapRequestRecord);
  }

  prepareRequest(input: LeaveRequestInput): PreparedLeaveRequest {
    this.validateInput(input);

    const expires = new Date(Date.now() + 15 * 60 * 1000);
    const prepared: PreparedLeaveRequest = {
      preparedRequestId: randomUUID(),
      input,
      summary: `${input.startDate} ~ ${input.endDate} / ${input.leaveTypeCode} / ${input.unit}`,
      validationMessages: ["로컬 검증 완료. 포탈 측 검증은 제출 시 수행됩니다."],
      status: LeaveRequestStatus.PREPARED,
      expiresAt: expires.toISOString(),
    };

    this.preparedRequests.set(prepared.preparedRequestId, prepared);
    return prepared;
  }

  async submitPreparedRequest(preparedRequestId: string): Promise<SubmitLeaveResult> {
    const session = await this.auth.ensureAuthenticatedSession();
    const prepared = this.preparedRequests.get(preparedRequestId);
    if (!prepared) {
      throw new PreparedRequestNotFoundError(
        `준비된 휴가 신청을 찾을 수 없습니다: ${preparedRequestId}`
      );
    }

    const employeeId = session.employeeId;
    const portalType = this.mapLeaveCodeToPortalType(prepared.input.leaveTypeCode);
    const period = this.calculatePeriod(prepared.input);

    const res = await this.http.post(
      "/api/vacation-svc/request",
      {
        employee: { employeeId },
        vacationType: portalType,
        startDt: prepared.input.startDate,
        endDt: prepared.input.endDate,
        period,
        vacationReason: prepared.input.reason ?? "",
        stat: "applied",
      },
      session
    );

    const payload = (await res.json()) as {
      data: { result: { vacationRequestId: number } };
    };
    const requestId = String(payload.data.result.vacationRequestId);
    prepared.status = LeaveRequestStatus.SUBMITTED;

    return {
      requestId,
      status: LeaveRequestStatus.SUBMITTED,
      message: `휴가 신청 ${requestId}이 제출되었습니다.`,
    };
  }

  async cancelRequest(requestId: string): Promise<CancelLeaveResult> {
    const session = await this.auth.ensureAuthenticatedSession();
    const res = await this.http.delete(
      `/api/vacation-svc/request/${requestId}`,
      session
    );
    const payload = (await res.json()) as {
      data: { result: { vacationRequestId: number } };
    };

    return {
      requestId: String(payload.data.result.vacationRequestId),
      status: LeaveRequestStatus.CANCELED,
      message: `휴가 신청 ${requestId}이 취소되었습니다.`,
    };
  }

  private validateInput(input: LeaveRequestInput): void {
    const types = Object.fromEntries(this.listLeaveTypes().map((t) => [t.code, t]));
    const leaveType = types[input.leaveTypeCode];
    if (!leaveType) {
      throw new LeaveValidationError(`알 수 없는 휴가 유형: ${input.leaveTypeCode}`);
    }
    if (leaveType.requiresReason && !input.reason) {
      throw new LeaveValidationError(`${leaveType.name}은 사유가 필요합니다.`);
    }
    if (
      (input.unit === LeaveUnit.HALF_DAY_AM ||
        input.unit === LeaveUnit.HALF_DAY_PM) &&
      input.startDate !== input.endDate
    ) {
      throw new LeaveValidationError("반차는 시작일과 종료일이 같아야 합니다.");
    }
  }

  private mapLeaveCodeToPortalType(code: string): PortalVacationType {
    const map: Record<string, PortalVacationType> = {
      annual: PortalVacationType.ALL_DAY,
      morning_half: PortalVacationType.MORNING_HALF,
      afternoon_half: PortalVacationType.AFTERNOON_HALF,
      admit: PortalVacationType.ADMIT,
      admit_morning_half: PortalVacationType.ADMIT_MORNING_HALF,
      admit_afternoon_half: PortalVacationType.ADMIT_AFTERNOON_HALF,
    };
    const result = map[code];
    if (!result) throw new LeaveValidationError(`지원하지 않는 휴가 유형: ${code}`);
    return result;
  }

  private calculatePeriod(input: LeaveRequestInput): number {
    if (
      input.unit === LeaveUnit.HALF_DAY_AM ||
      input.unit === LeaveUnit.HALF_DAY_PM
    ) {
      return 0.5;
    }
    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) + 1;
  }

  private mapRequestRecord(item: Record<string, unknown>): LeaveRequestRecord {
    const statusMap: Record<string, LeaveRequestStatus> = {
      applied: LeaveRequestStatus.SUBMITTED,
      inProgress: LeaveRequestStatus.SUBMITTED,
      approved: LeaveRequestStatus.APPROVED,
      rejected: LeaveRequestStatus.REJECTED,
      cancel: LeaveRequestStatus.CANCELED,
    };
    const typeMap: Record<string, LeaveUnit> = {
      AM: LeaveUnit.HALF_DAY_AM,
      PM: LeaveUnit.HALF_DAY_PM,
      admitAm: LeaveUnit.HALF_DAY_AM,
      admitPm: LeaveUnit.HALF_DAY_PM,
    };

    return {
      requestId: String(item["vacationRequestId"]),
      leaveTypeName: String(item["vacationType"]),
      startDate: String(item["startDt"]),
      endDate: String(item["endDt"]),
      unit: typeMap[String(item["vacationType"])] ?? LeaveUnit.FULL_DAY,
      status: statusMap[String(item["stat"])] ?? LeaveRequestStatus.SUBMITTED,
      reason: item["vacationReason"] ? String(item["vacationReason"]) : undefined,
      createdAt: item["requestDt"] ? `${item["requestDt"]}T00:00:00` : undefined,
    };
  }
}
