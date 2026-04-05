/**
 * 포탈 접속 설정.
 * 환경변수에서 로드하며, 값이 없으면 기본값을 사용한다.
 */
export interface PortalConfig {
  baseUrl: string;
  loginPath: string;
  loginSuccessUrl: string;
  timeoutMs: number;
  sessionFile: string;
  userAgent: string;
  verifyTls: boolean;
  companyHolidays: string[];
  holidayApiBaseUrl: string;
}

function parseDateList(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(): PortalConfig {
  return {
    baseUrl: process.env.PORTAL_BASE_URL ?? "https://portal.twolinecloud.com",
    loginPath: process.env.PORTAL_LOGIN_PATH ?? "/",
    loginSuccessUrl:
      process.env.PORTAL_LOGIN_SUCCESS_URL ?? "/dashboard/landing",
    timeoutMs: parseFloat(process.env.PORTAL_TIMEOUT_SECONDS ?? "15") * 1000,
    sessionFile:
      process.env.PORTAL_MCP_SESSION_FILE ?? ".portal-session.json",
    userAgent: process.env.PORTAL_USER_AGENT ?? "tlc-portal-mcp/0.1",
    verifyTls: !["0", "false", "no"].includes(
      (process.env.PORTAL_VERIFY_TLS ?? "true").toLowerCase()
    ),
    companyHolidays: parseDateList(process.env.PORTAL_COMPANY_HOLIDAYS),
    holidayApiBaseUrl:
      process.env.PORTAL_HOLIDAY_API_BASE_URL ?? "https://date.nager.at/api/v3",
  };
}
