# Worklog

## 2026-04-05

### Decisions

- Started the project as a TypeScript port of the earlier Python `portal-mcp`.
- Kept `stdio` as the transport so the package can run directly from `npx`.
- Chose TypeScript so users do not need a separate Python or venv setup.
- Initial scope includes both leave and timetable domains.

### TypeScript Port Summary

- `core/config.py` -> `core/config.ts`
- `core/errors.py` -> `core/errors.ts`
- `core/session_store.py` -> `core/session-store.ts`
- `core/auth.py` -> `core/auth.ts`
- `core/http_client.py` -> `core/http-client.ts`
- `domains/leave/models.py` -> `domains/leave/models.ts`
- `domains/leave/service.py` -> `domains/leave/service.ts`
- `tools/auth_tools.py` -> `tools/auth-tools.ts`
- `tools/leave_tools.py` -> `tools/leave-tools.ts`
- `mcp_server.py` + `server.py` -> `server.ts`

### Core Improvements

- Removed the Python-specific thread executor workaround from browser login.
- Switched HTTP calls to built-in `fetch`.
- Kept a single server entrypoint with direct MCP tool registration.
- Added package-driven server version reporting through `system.info`.
- Added npm latest version checks through `system.check_update`.

### Timetable Domain Added

- Added `docs/timetable-roadmap.md`.
- Added `src/domains/timetable/models.ts`.
- Added `src/domains/timetable/service.ts`.
- Added `src/tools/timetable-tools.ts`.
- Registered `timetable.*` MCP tools in `src/server.ts`.

### Timetable Rules Implemented

- Default writable time is 8 hours per day.
- Half-day leave (`AM`, `PM`, `admitAm`, `admitPm`) reduces writable time to 4 hours.
- Full-day leave (`allDay`, `admit`) blocks timetable entry for that day.
- Weekends, Korean public holidays, and configured company closures also block timetable entry for that day.
- `workDate` and `taskType` are always required.
- `projectId` is required unless `taskType === NORMAL`.
- Prepare and submit flows are separated for write operations.

### Tools Currently Registered

- `system.info`
- `system.check_update`
- `auth.login`
- `auth.import_vuex`
- `auth.status`
- `auth.clear`
- `leave.list_types`
- `leave.get_balances`
- `leave.list_requests`
- `leave.prepare_request`
- `leave.submit_prepared_request`
- `leave.cancel_request`
- `project.list`
- `timetable.get_manage_info`
- `timetable.get_user_summary`
- `timetable.get_available_range`
- `timetable.get_day`
- `timetable.get_range_overview`
- `timetable.list_projects`
- `timetable.get_day_capacity`
- `timetable.prepare_day_entry`
- `timetable.submit_prepared_day_entry`
- `timetable.prepare_bulk_entries`
- `timetable.submit_prepared_bulk_entries`
- `timetable.clear_day`

### Validation

- `cmd /c npm run build` passed.

### Calendar Support Added

- Added non-working day resolution for weekends and 2026 Korean public holidays.
- Added `PORTAL_COMPANY_HOLIDAYS` env support for company-wide closure dates.
- `timetable.get_day_capacity` now returns `dayType` and optional `holidayName`.
- Added Nager.Date (`/PublicHolidays/{year}/KR`) as the primary Korean holiday source with in-memory year caching.
- Kept the static 2026 holiday table as fallback when the external holiday API is unavailable.
- Added `timetable.get_range_overview` so month/range summaries do not need to infer status from `get_day` alone.
- Updated `timetable.get_range_overview` to use `GET /api/attendance-svc/timetable/user` as the primary source for all entered rows, instead of calling the day-detail API for every date in range.
- Split timetable vacation overlay lookup from generic leave queries.
- Updated timetable leave overlay to follow the portal overview rule using `GET /api/vacation-svc/request/secure` with `sort=requestDt`.
- Removed the `stat` query filter from timetable overlay lookup and now filter out `cancel` / `reject` client-side to better match the portal overview behavior.
- Added leave status alias normalization (`pending` -> `applied`, `completed` -> `approved`, etc.) and safer error handling for unexpected leave list responses.
- Added a timetable project-list fallback: when `GET /api/project-svc/project/summary` returns empty, `timetable.list_projects` now derives distinct projects from `GET /api/attendance-svc/timetable/user`.
- Fixed timetable project-list parsing to accept the real portal response shape (`data.list`), not just the older documented `data.result` shape.
- Added `project.list` as the primary project-domain tool and kept `timetable.list_projects` as a compatibility alias.

### Auth Behavior Change

- Added `ensureAuthenticatedSession()` to auto-open the login browser when no saved JWT exists.
- Leave and timetable domain tools now continue the original request after login instead of returning an immediate "not authenticated" error.
- Current behavior only auto-recovers when the session is missing.
- Expired-token retry after a `401` is not implemented yet.
- Added a post-login wait for `localStorage['vuex']` so the browser does not close before the token is actually written.
- Reworked the login token capture to poll `localStorage['vuex']` across redirects instead of relying on a single page function wait.

### Current Project Shape

```text
src/
  server.ts
  core/
  domains/
    leave/
    timetable/
  tools/
```

### Follow-up

1. Test timetable read and write flows against the live portal.
2. Confirm whether `applied` leave should block or limit timetable entry in production.
3. Confirm that `NORMAL` rows without `projectId` are accepted by the portal backend.
4. Update `README.md` with timetable tools and version-diagnostics usage.
