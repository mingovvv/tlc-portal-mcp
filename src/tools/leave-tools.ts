/**
 * 휴가 관련 MCP tool 핸들러.
 */

import type { LeaveService } from "../domains/leave/service.js";
import type { LeaveRequestQuery } from "../domains/leave/models.js";

export async function leaveGetBalances(
  service: LeaveService
): Promise<unknown[]> {
  return service.getLeaveBalances();
}

export function leaveListTypes(service: LeaveService): unknown[] {
  return service.listLeaveTypes();
}

export async function leaveListRequests(
  service: LeaveService,
  query?: Partial<LeaveRequestQuery>
): Promise<unknown[]> {
  return service.listRequests(query);
}

export function leavePrepareRequest(
  service: LeaveService,
  input: {
    leaveTypeCode: string;
    startDate: string;
    endDate: string;
    unit?: "full_day" | "half_day_am" | "half_day_pm";
    reason?: string;
    delegateEmployeeId?: string;
    contactPhone?: string;
  }
): unknown {
  return service.prepareRequest({
    leaveTypeCode: input.leaveTypeCode,
    startDate: input.startDate,
    endDate: input.endDate,
    unit: input.unit ?? "full_day",
    reason: input.reason,
    delegateEmployeeId: input.delegateEmployeeId,
    contactPhone: input.contactPhone,
  });
}

export async function leaveSubmitPreparedRequest(
  service: LeaveService,
  preparedRequestId: string
): Promise<unknown> {
  return service.submitPreparedRequest(preparedRequestId);
}

export async function leaveCancelRequest(
  service: LeaveService,
  requestId: string
): Promise<unknown> {
  return service.cancelRequest(requestId);
}
