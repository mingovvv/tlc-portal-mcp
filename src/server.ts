#!/usr/bin/env node
/**
 * tlc-portal-mcp 진입점.
 * stdio 기반 MCP 서버를 시작한다.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { PortalAuthManager } from "./core/auth.js";
import { loadConfig } from "./core/config.js";
import { PortalHttpClient } from "./core/http-client.js";
import { FileSessionStore } from "./core/session-store.js";
import { LeaveService } from "./domains/leave/service.js";
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

async function main() {
  const config = loadConfig();
  const store = new FileSessionStore(config.sessionFile);
  const auth = new PortalAuthManager(config, store);
  const http = new PortalHttpClient(config, store);
  const leaveService = new LeaveService(config, http, auth);

  const server = new McpServer({
    name: "tlc-portal-mcp",
    version: "0.1.0",
  });

  // ── Auth tools ──────────────────────────────────────────────

  server.tool(
    "auth.login",
    "브라우저를 열어 사용자가 직접 로그인하면 JWT를 자동 저장한다.",
    { timeout_seconds: z.number().int().min(30).max(600).default(300) },
    async ({ timeout_seconds }) =>
      toContent(await authLogin(auth, store, config.sessionFile, timeout_seconds))
  );

  server.tool(
    "auth.import_vuex",
    "브라우저 localStorage['vuex'] 값을 붙여넣어 인증 상태를 가져온다.",
    { vuex_payload: z.string() },
    ({ vuex_payload }) =>
      toContent(authImportVuex(auth, config.sessionFile, vuex_payload))
  );

  server.tool(
    "auth.status",
    "현재 인증 상태를 반환한다.",
    {},
    () => toContent(authStatus(auth, config.sessionFile))
  );

  server.tool(
    "auth.clear",
    "저장된 인증 세션을 삭제한다.",
    {},
    () => toContent(authClear(auth, config.sessionFile))
  );

  // ── Leave tools ─────────────────────────────────────────────

  server.tool(
    "leave.list_types",
    "지원하는 휴가 유형 목록을 반환한다.",
    {},
    () => toContent(leaveListTypes(leaveService))
  );

  server.tool(
    "leave.get_balances",
    "현재 잔여 휴가를 조회한다.",
    {},
    async () => toContent(await leaveGetBalances(leaveService))
  );

  server.tool(
    "leave.list_requests",
    "휴가 신청 내역을 조회한다.",
    {
      statuses: z
        .array(z.string())
        .default(["applied", "inProgress"])
        .describe("조회할 상태 목록"),
      from_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("조회 시작일 (YYYY-MM-DD)"),
      to_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("조회 종료일 (YYYY-MM-DD)"),
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
    "휴가 신청을 준비한다. 제출 전 확인 단계다.",
    {
      leave_type_code: z
        .enum(["annual", "morning_half", "afternoon_half", "admit"])
        .describe("휴가 유형 코드"),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("시작일"),
      end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("종료일"),
      unit: z
        .enum(["full_day", "half_day_am", "half_day_pm"])
        .default("full_day"),
      reason: z.string().optional().describe("휴가 사유"),
      delegate_employee_id: z.string().optional().describe("업무 인수인계 담당자 ID"),
      contact_phone: z.string().optional().describe("비상 연락처"),
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
    "준비된 휴가 신청을 포탈에 제출한다.",
    { prepared_request_id: z.string() },
    async ({ prepared_request_id }) =>
      toContent(await leaveSubmitPreparedRequest(leaveService, prepared_request_id))
  );

  server.tool(
    "leave.cancel_request",
    "기존 휴가 신청을 취소한다.",
    { request_id: z.string().describe("취소할 휴가 신청 ID") },
    async ({ request_id }) =>
      toContent(await leaveCancelRequest(leaveService, request_id))
  );

  // ── Start ────────────────────────────────────────────────────

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
