import type { TimetableService } from "../domains/timetable/service.js";

export async function projectList(service: TimetableService, limit?: number) {
  return service.listProjects(limit);
}
