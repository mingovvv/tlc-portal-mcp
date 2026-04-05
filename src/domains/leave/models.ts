/**
 * 휴가 도메인 모델.
 */

import { z } from "zod";

export const LeaveUnit = {
  FULL_DAY: "full_day",
  HALF_DAY_AM: "half_day_am",
  HALF_DAY_PM: "half_day_pm",
} as const;
export type LeaveUnit = (typeof LeaveUnit)[keyof typeof LeaveUnit];

export const LeaveRequestStatus = {
  DRAFT: "draft",
  PREPARED: "prepared",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  REJECTED: "rejected",
  CANCELED: "canceled",
} as const;
export type LeaveRequestStatus =
  (typeof LeaveRequestStatus)[keyof typeof LeaveRequestStatus];

export const PortalVacationType = {
  ALL_DAY: "allDay",
  MORNING_HALF: "AM",
  AFTERNOON_HALF: "PM",
  ADMIT: "admit",
  ADMIT_MORNING_HALF: "admitAm",
  ADMIT_AFTERNOON_HALF: "admitPm",
} as const;
export type PortalVacationType =
  (typeof PortalVacationType)[keyof typeof PortalVacationType];

export interface LeaveType {
  code: string;
  name: string;
  portalValue: PortalVacationType | null;
  supportsHalfDay: boolean;
  requiresReason: boolean;
}

export interface LeaveBalance {
  leaveTypeCode: string;
  leaveTypeName: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
}

export interface LeaveRequestInput {
  leaveTypeCode: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  unit: LeaveUnit;
  reason?: string;
  delegateEmployeeId?: string;
  contactPhone?: string;
}

export interface PreparedLeaveRequest {
  preparedRequestId: string;
  input: LeaveRequestInput;
  summary: string;
  validationMessages: string[];
  status: LeaveRequestStatus;
  expiresAt: string; // ISO datetime
}

export interface LeaveRequestRecord {
  requestId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  unit: LeaveUnit;
  status: LeaveRequestStatus;
  reason?: string;
  createdAt?: string;
}

export interface LeaveRequestQuery {
  employeeId: number;
  statuses: string[];
  sort: string;
  order: string;
  dateKey: string;
  fromDate?: string;
  toDate?: string;
  limit: number;
  offset: number;
}

export interface SubmitLeaveResult {
  requestId: string | null;
  status: LeaveRequestStatus;
  message: string;
}

export interface CancelLeaveResult {
  requestId: string;
  status: LeaveRequestStatus;
  message: string;
}

// Zod 스키마 (MCP tool 입력 검증용)
export const PrepareLeaveRequestSchema = z.object({
  leave_type_code: z.string(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식"),
  unit: z.enum(["full_day", "half_day_am", "half_day_pm"]).default("full_day"),
  reason: z.string().optional(),
  delegate_employee_id: z.string().optional(),
  contact_phone: z.string().optional(),
});
