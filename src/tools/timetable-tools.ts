import type { TimetableService } from "../domains/timetable/service.js";
import type { TimetableRowInput } from "../domains/timetable/models.js";

export async function timetableGetManageInfo(service: TimetableService) {
  return service.getManageInfo();
}

export async function timetableGetUserSummary(service: TimetableService) {
  return service.getUserSummary();
}

export async function timetableGetAvailableRange(service: TimetableService) {
  return service.getAvailableRange();
}

export async function timetableGetDay(service: TimetableService, workDate: string) {
  return service.getDay(workDate);
}

export async function timetableGetRangeOverview(
  service: TimetableService,
  startDate: string,
  endDate: string
) {
  return service.getRangeOverview(startDate, endDate);
}

export async function timetableListProjects(
  service: TimetableService,
  limit?: number
) {
  return service.listProjects(limit);
}

export async function timetableGetDayCapacity(
  service: TimetableService,
  workDate: string
) {
  return service.getDayCapacity(workDate);
}

export async function timetablePrepareDayEntry(
  service: TimetableService,
  input: { workDate: string; rows: TimetableRowInput[] }
) {
  return service.prepareDayEntry(input);
}

export async function timetableSubmitPreparedDayEntry(
  service: TimetableService,
  preparedEntryId: string
) {
  return service.submitPreparedDayEntry(preparedEntryId);
}

export async function timetablePrepareBulkEntries(
  service: TimetableService,
  input: { startDate: string; endDate: string; rows: TimetableRowInput[] }
) {
  return service.prepareBulkEntries(input);
}

export async function timetableSubmitPreparedBulkEntries(
  service: TimetableService,
  preparedEntryId: string
) {
  return service.submitPreparedBulkEntries(preparedEntryId);
}

export async function timetableClearDay(
  service: TimetableService,
  workDate: string
) {
  return service.clearDay(workDate);
}
