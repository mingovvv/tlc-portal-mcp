#!/usr/bin/env node
/**
 * tlc-portal-mcp entry point.
 * Starts the stdio-based MCP server and registers all tools.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PortalAuthManager } from "./core/auth.js";
import { loadConfig } from "./core/config.js";
import { PortalHttpClient } from "./core/http-client.js";
import { getPackageName, getPackageVersion } from "./core/package-info.js";
import { FileSessionStore } from "./core/session-store.js";
import { LeaveService } from "./domains/leave/service.js";
import { TimetableTaskType } from "./domains/timetable/models.js";
import { TimetableService } from "./domains/timetable/service.js";
import {
  authClear,
  authImportVuex,
  authLogin,
  authStatus,
} from "./tools/auth-tools.js";
import {
  leaveCancelRequest,
  leaveGetBalances,
  leaveListRequests,
  leaveListTypes,
  leavePrepareRequest,
  leaveSubmitPreparedRequest,
} from "./tools/leave-tools.js";
import { systemCheckUpdate, systemInfo } from "./tools/system-tools.js";
import {
  timetableClearDay,
  timetableGetAvailableRange,
  timetableGetDay,
  timetableGetDayCapacity,
  timetableGetManageInfo,
  timetableGetRangeOverview,
  timetableGetUserSummary,
  timetableListProjects,
  timetablePrepareBulkEntries,
  timetablePrepareDayEntry,
  timetableSubmitPreparedBulkEntries,
  timetableSubmitPreparedDayEntry,
} from "./tools/timetable-tools.js";
import { projectList } from "./tools/project-tools.js";

async function main() {
  const config = loadConfig();
  const store = new FileSessionStore(config.sessionFile);
  const auth = new PortalAuthManager(config, store);
  const http = new PortalHttpClient(config, store);
  const leaveService = new LeaveService(config, http, auth);
  const timetableService = new TimetableService(config, http, auth);
  const toolNames = [
    "system.info",
    "system.check_update",
    "auth.login",
    "auth.import_vuex",
    "auth.status",
    "auth.clear",
    "leave.list_types",
    "leave.get_balances",
    "leave.list_requests",
    "leave.prepare_request",
    "leave.submit_prepared_request",
    "leave.cancel_request",
    "project.list",
    "timetable.get_manage_info",
    "timetable.get_user_summary",
    "timetable.get_available_range",
    "timetable.get_day",
    "timetable.get_range_overview",
    "timetable.list_projects",
    "timetable.get_day_capacity",
    "timetable.prepare_day_entry",
    "timetable.submit_prepared_day_entry",
    "timetable.prepare_bulk_entries",
    "timetable.submit_prepared_bulk_entries",
    "timetable.clear_day",
  ];

  const timetableRowSchema = z.object({
    task_type: z.nativeEnum(TimetableTaskType),
    work_time: z.number().positive(),
    project_id: z.number().int().optional(),
    note: z.string().optional(),
  });

  const server = new McpServer({
    name: getPackageName(),
    version: getPackageVersion(),
  });

  server.tool(
    "system.info",
    "Returns the current MCP server metadata and registered tool list.",
    {},
    () => toContent(systemInfo({ toolNames }))
  );

  server.tool(
    "system.check_update",
    "Checks npm for a newer published package version.",
    {},
    async () => toContent(await systemCheckUpdate())
  );

  server.tool(
    "auth.login",
    "Opens a browser for interactive portal login and stores the JWT.",
    { timeout_seconds: z.number().int().min(30).max(600).default(300) },
    async ({ timeout_seconds }) =>
      toContent(await authLogin(auth, store, config.sessionFile, timeout_seconds))
  );

  server.tool(
    "auth.import_vuex",
    "Imports authentication state from browser localStorage['vuex'].",
    { vuex_payload: z.string() },
    ({ vuex_payload }) =>
      toContent(authImportVuex(auth, config.sessionFile, vuex_payload))
  );

  server.tool(
    "auth.status",
    "Returns the current authentication state.",
    {},
    () => toContent(authStatus(auth, config.sessionFile))
  );

  server.tool(
    "auth.clear",
    "Clears the locally stored authentication session.",
    {},
    () => toContent(authClear(auth, config.sessionFile))
  );

  server.tool(
    "leave.list_types",
    "Returns the supported leave type list.",
    {},
    () => toContent(leaveListTypes(leaveService))
  );

  server.tool(
    "leave.get_balances",
    "Fetches the current leave balances.",
    {},
    async () => toContent(await leaveGetBalances(leaveService))
  );

  server.tool(
    "leave.list_requests",
    "Lists leave requests for the requested period and statuses.",
    {
      statuses: z
        .array(z.string())
        .default(["applied", "inProgress"])
        .describe("Statuses to query"),
      from_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Start date (YYYY-MM-DD)"),
      to_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("End date (YYYY-MM-DD)"),
      limit: z.number().int().min(1).max(100).default(10),
      offset: z.number().int().min(0).default(0),
    },
    async ({ statuses, from_date, to_date, limit, offset }) =>
      toContent(
        await leaveListRequests(leaveService, {
          statuses,
          fromDate: from_date,
          toDate: to_date,
          limit,
          offset,
        })
      )
  );

  server.tool(
    "leave.prepare_request",
    "Prepares a leave request payload before submission.",
    {
      leave_type_code: z
        .enum(["annual", "morning_half", "afternoon_half", "admit"])
        .describe("Leave type code"),
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Start date"),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("End date"),
      unit: z
        .enum(["full_day", "half_day_am", "half_day_pm"])
        .default("full_day"),
      reason: z.string().optional().describe("Leave reason"),
      delegate_employee_id: z
        .string()
        .optional()
        .describe("Delegate employee ID"),
      contact_phone: z.string().optional().describe("Emergency contact number"),
    },
    ({
      leave_type_code,
      start_date,
      end_date,
      unit,
      reason,
      delegate_employee_id,
      contact_phone,
    }) =>
      toContent(
        leavePrepareRequest(leaveService, {
          leaveTypeCode: leave_type_code,
          startDate: start_date,
          endDate: end_date,
          unit,
          reason,
          delegateEmployeeId: delegate_employee_id,
          contactPhone: contact_phone,
        })
      )
  );

  server.tool(
    "leave.submit_prepared_request",
    "Submits a previously prepared leave request.",
    { prepared_request_id: z.string() },
    async ({ prepared_request_id }) =>
      toContent(await leaveSubmitPreparedRequest(leaveService, prepared_request_id))
  );

  server.tool(
    "leave.cancel_request",
    "Cancels an existing leave request.",
    { request_id: z.string().describe("Leave request ID to cancel") },
    async ({ request_id }) =>
      toContent(await leaveCancelRequest(leaveService, request_id))
  );

  server.tool(
    "project.list",
    "Returns project choices that can be used for timetable entry.",
    { limit: z.number().int().min(1).max(999999).default(999999) },
    async ({ limit }) => toContent(await projectList(timetableService, limit))
  );

  server.tool(
    "timetable.get_manage_info",
    "Returns timetable management and closing information.",
    {},
    async () => toContent(await timetableGetManageInfo(timetableService))
  );

  server.tool(
    "timetable.get_user_summary",
    "Returns the current user's timetable summary.",
    {},
    async () => toContent(await timetableGetUserSummary(timetableService))
  );

  server.tool(
    "timetable.get_available_range",
    "Returns the current timetable input availability range.",
    {},
    async () => toContent(await timetableGetAvailableRange(timetableService))
  );

  server.tool(
    "timetable.get_day",
    "Returns timetable rows for a specific date.",
    {
      work_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Work date (YYYY-MM-DD)"),
    },
    async ({ work_date }) =>
      toContent(await timetableGetDay(timetableService, work_date))
  );

  server.tool(
    "timetable.get_range_overview",
    "Returns a date-by-date overview for a range, combining timetable rows with holiday and leave capacity.",
    {
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Start date (YYYY-MM-DD)"),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("End date (YYYY-MM-DD)"),
    },
    async ({ start_date, end_date }) =>
      toContent(
        await timetableGetRangeOverview(
          timetableService,
          start_date,
          end_date
        )
      )
  );

  server.tool(
    "timetable.list_projects",
    "Compatibility alias for project.list. Returns project choices for timetable entry.",
    { limit: z.number().int().min(1).max(999999).default(999999) },
    async ({ limit }) =>
      toContent(await timetableListProjects(timetableService, limit))
  );

  server.tool(
    "timetable.get_day_capacity",
    "Calculates writable hours for a date after applying leave records.",
    {
      work_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Work date (YYYY-MM-DD)"),
    },
    async ({ work_date }) =>
      toContent(await timetableGetDayCapacity(timetableService, work_date))
  );

  server.tool(
    "timetable.prepare_day_entry",
    "Prepares a single-day timetable entry. work_date and task_type are required. project_id is required unless task_type is NORMAL.",
    {
      work_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Work date (YYYY-MM-DD)"),
      rows: z.array(timetableRowSchema).min(1),
    },
    async ({ work_date, rows }) =>
      toContent(
        await timetablePrepareDayEntry(timetableService, {
          workDate: work_date,
          rows: rows.map((row) => ({
            taskType: row.task_type,
            workTime: row.work_time,
            projectId: row.project_id,
            note: row.note,
          })),
        })
      )
  );

  server.tool(
    "timetable.submit_prepared_day_entry",
    "Submits a previously prepared single-day timetable entry.",
    { prepared_entry_id: z.string() },
    async ({ prepared_entry_id }) =>
      toContent(
        await timetableSubmitPreparedDayEntry(
          timetableService,
          prepared_entry_id
        )
      )
  );

  server.tool(
    "timetable.prepare_bulk_entries",
    "Prepares repeated timetable entries for a date range. project_id is required unless task_type is NORMAL.",
    {
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Start date (YYYY-MM-DD)"),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("End date (YYYY-MM-DD)"),
      rows: z.array(timetableRowSchema).min(1),
    },
    async ({ start_date, end_date, rows }) =>
      toContent(
        await timetablePrepareBulkEntries(timetableService, {
          startDate: start_date,
          endDate: end_date,
          rows: rows.map((row) => ({
            taskType: row.task_type,
            workTime: row.work_time,
            projectId: row.project_id,
            note: row.note,
          })),
        })
      )
  );

  server.tool(
    "timetable.submit_prepared_bulk_entries",
    "Submits previously prepared bulk timetable entries.",
    { prepared_entry_id: z.string() },
    async ({ prepared_entry_id }) =>
      toContent(
        await timetableSubmitPreparedBulkEntries(
          timetableService,
          prepared_entry_id
        )
      )
  );

  server.tool(
    "timetable.clear_day",
    "Clears all timetable rows for a specific date.",
    {
      work_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .describe("Work date (YYYY-MM-DD)"),
    },
    async ({ work_date }) =>
      toContent(await timetableClearDay(timetableService, work_date))
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function toContent(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
