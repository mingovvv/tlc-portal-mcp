/**
 * 인증 관련 MCP tool 핸들러.
 */

import type { PortalAuthManager } from "../core/auth.js";
import { AuthenticationFlowError } from "../core/errors.js";
import type { FileSessionStore } from "../core/session-store.js";

export async function authLogin(
  auth: PortalAuthManager,
  store: FileSessionStore,
  sessionFile: string,
  timeoutSeconds = 300
): Promise<Record<string, unknown>> {
  try {
    const session = await auth.interactiveLogin(timeoutSeconds);
    return {
      authenticated: session.authenticated,
      hasJwtToken: Boolean(session.jwtToken),
      employeeId: session.employeeId,
      sessionFile,
      loginMode: "interactive_browser",
    };
  } catch (err) {
    if (err instanceof AuthenticationFlowError) {
      return {
        authenticated: false,
        hasJwtToken: false,
        loginMode: "interactive_browser",
        error: err.message,
        loginUrl: err.loginUrl,
        successUrl: err.successUrl,
        detail: err.detail,
      };
    }
    throw err;
  }
}

export function authImportVuex(
  auth: PortalAuthManager,
  sessionFile: string,
  vuexPayload: string
): Record<string, unknown> {
  const session = auth.importVuexState(vuexPayload);
  return {
    authenticated: session.authenticated,
    hasJwtToken: Boolean(session.jwtToken),
    employeeId: session.employeeId,
    sessionFile,
    loginMode: "manual_vuex_import",
  };
}

export function authStatus(
  auth: PortalAuthManager,
  sessionFile: string
): Record<string, unknown> {
  const session = auth.getSession();
  return {
    authenticated: session.authenticated && Boolean(session.jwtToken),
    hasJwtToken: Boolean(session.jwtToken),
    employeeId: session.employeeId,
    sessionFile,
  };
}

export function authClear(
  auth: PortalAuthManager,
  sessionFile: string
): Record<string, unknown> {
  auth.logout();
  return {
    authenticated: false,
    hasJwtToken: false,
    sessionFile,
  };
}
