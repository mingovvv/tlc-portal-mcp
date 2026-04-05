export const TimetableTaskType = {
  EXECUTE: "EXECUTE",
  AFTER_SVC: "AFTER_SVC",
  RESEARCH: "RESEARCH",
  SUGGEST: "SUGGEST",
  NORMAL: "NORMAL",
} as const;
export type TimetableTaskType =
  (typeof TimetableTaskType)[keyof typeof TimetableTaskType];

export interface TimetableProject {
  projectId: number;
  projectName: string;
  projectCode?: string;
  projectStatus?: string;
  projectType?: string;
  source?: "project_summary" | "user_summary_fallback";
}

export interface TimetableRowInput {
  taskType: TimetableTaskType;
  workTime: number;
  projectId?: number;
  note?: string;
}

export interface TimetablePreparedRow {
  taskType: TimetableTaskType;
  workTime: number;
  projectId?: number;
  projectName?: string;
  note?: string;
}

export interface TimetableDayRecord {
  workDate: string;
  rows: Array<{
    workDate: string;
    projectId?: number;
    projectName?: string;
    taskType: TimetableTaskType | string;
    workTime: number;
    note?: string | null;
  }>;
}

export interface TimetableRangeOverviewDay {
  workDate: string;
  dayType:
    | "workday"
    | "half_day_leave"
    | "full_day_leave"
    | "weekend"
    | "public_holiday"
    | "company_closure";
  holidayName?: string;
  canWrite: boolean;
  maxWorkTime: number;
  rowCount: number;
  totalWorkTime: number;
  hasEntry: boolean;
  projectNames: string[];
  taskTypes: string[];
  noteCount: number;
  reason?: string;
}

export interface TimetableDayCapacity {
  workDate: string;
  dayType:
    | "workday"
    | "half_day_leave"
    | "full_day_leave"
    | "weekend"
    | "public_holiday"
    | "company_closure";
  maxWorkTime: number;
  leaveType: "none" | "half_day" | "full_day";
  holidayName?: string;
  leaveRequests: Array<{
    requestId: string;
    startDate: string;
    endDate: string;
    portalVacationType: string;
    status: string;
  }>;
  vacationOverlaySource?: string;
  canWrite: boolean;
  reason?: string;
}

export interface PreparedDayEntry {
  preparedEntryId: string;
  workDate: string;
  rows: TimetablePreparedRow[];
  totalWorkTime: number;
  capacity: TimetableDayCapacity;
  validationMessages: string[];
  expiresAt: string;
}

export interface PreparedBulkEntryDay {
  workDate: string;
  rows: TimetablePreparedRow[];
  totalWorkTime: number;
  capacity: TimetableDayCapacity;
}

export interface PreparedBulkEntry {
  preparedEntryId: string;
  days: PreparedBulkEntryDay[];
  validationMessages: string[];
  expiresAt: string;
}
