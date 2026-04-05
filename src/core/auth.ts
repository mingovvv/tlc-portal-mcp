import { chromium } from "playwright";
import type { PortalConfig } from "./config.js";
import {
  AuthenticationFlowError,
  AuthenticationRequiredError,
} from "./errors.js";
import type { FileSessionStore, PortalSession } from "./session-store.js";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PortalAuthManager {
  constructor(
    private readonly config: PortalConfig,
    private readonly store: FileSessionStore
  ) {}

  getSession(): PortalSession {
    return this.store.load();
  }

  async ensureAuthenticatedSession(timeoutSeconds = 300): Promise<PortalSession> {
    const session = this.getSession();
    if (session.authenticated && session.jwtToken) {
      return session;
    }
    return this.interactiveLogin(timeoutSeconds);
  }

  requireAuthenticatedSession(): PortalSession {
    const session = this.getSession();
    if (!session.authenticated || !session.jwtToken) {
      throw new AuthenticationRequiredError();
    }
    return session;
  }

  markAuthenticated(opts: {
    jwtToken: string;
    cookies?: Record<string, string>;
    csrfToken?: string;
    employeeId?: number | null;
  }): PortalSession {
    const session: PortalSession = {
      authenticated: true,
      jwtToken: opts.jwtToken,
      csrfToken: opts.csrfToken ?? null,
      cookies: opts.cookies ?? {},
      employeeId: opts.employeeId ?? null,
    };
    this.store.save(session);
    return session;
  }

  static decodeJwtEmployeeId(token: string): number | null {
    try {
      const payloadB64 = token.split(".")[1];
      const padded = payloadB64 + "=".repeat((4 - (payloadB64.length % 4)) % 4);
      const decoded = Buffer.from(padded, "base64url").toString("utf-8");
      const claims = JSON.parse(decoded) as Record<string, unknown>;
      for (const key of ["employeeId", "employee_id", "empId", "sub"]) {
        const value = claims[key];
        if (value !== undefined && value !== null) {
          const parsed = parseInt(String(value), 10);
          if (!Number.isNaN(parsed)) return parsed;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  importVuexState(vuexPayload: string): PortalSession {
    const parsed = JSON.parse(vuexPayload) as Record<string, unknown>;
    const authority = parsed["authority"] as Record<string, unknown> | undefined;
    const token = authority?.["token"] as string | undefined;

    if (!token) {
      throw new AuthenticationRequiredError(
        "vuex payload에서 authority.token 값을 찾을 수 없습니다."
      );
    }

    const employeeId = PortalAuthManager.decodeJwtEmployeeId(token);
    return this.markAuthenticated({ jwtToken: token, employeeId });
  }

  async interactiveLogin(timeoutSeconds = 300): Promise<PortalSession> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const loginUrl = `${baseUrl}/${this.config.loginPath.replace(/^\//, "")}`;
    const successUrl = `${baseUrl}/${this.config.loginSuccessUrl.replace(/^\//, "")}`;

    let browser: import("playwright").Browser | undefined;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });

      // 1단계: OTP 인증 API 응답 대기.
      //   ID/PW 제출 직후 Vuex에 임시 토큰이 세팅될 수 있으므로
      //   반드시 OTP auth API 응답을 확인한 뒤 최종 토큰을 읽어야 한다.
      await page.waitForResponse(
        (response) =>
          response.url().includes("/account/otp/auth") &&
          response.status() === 200,
        { timeout: timeoutSeconds * 1000 }
      );

      // 2단계: OTP 완료 후 Vuex에 최종 토큰이 반영될 때까지 잠깐 대기.
      await sleep(1500);

      // 3단계: 최종 Vuex 토큰 추출.
      const vuexPayload = await this.waitForVuexPayload(page, 15000);

      if (!vuexPayload) {
        throw new AuthenticationFlowError(
          "OTP 인증은 완료됐지만 localStorage['vuex'].authority.token 값을 찾지 못했습니다.",
          { loginUrl, successUrl }
        );
      }

      const session = this.importVuexState(vuexPayload);
      await this.showSuccessToast(page);
      // 브라우저는 닫지 않음 — 사용자가 포털을 계속 사용할 수 있도록 유지.
      return session;
    } catch (err) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      if (err instanceof AuthenticationFlowError) throw err;
      throw new AuthenticationFlowError(
        "로그인 플로우가 완료되기 전에 실패했습니다.",
        {
          loginUrl,
          successUrl,
          detail: err instanceof Error ? err.message : String(err),
        }
      );
    }
  }

  private async waitForVuexPayload(
    page: import("playwright").Page,
    timeoutMs = 15000
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      if (page.isClosed()) {
        return null;
      }

      try {
        // vuex에 authority.token이 실제로 세팅된 경우에만 반환.
        // 로그인 전에도 vuex가 존재할 수 있으므로 토큰 유무로 판단한다.
        const payload = await page.evaluate(() => {
          const raw = window.localStorage.getItem("vuex");
          if (!raw) return null;
          try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const authority = parsed["authority"] as Record<string, unknown> | undefined;
            const token = authority?.["token"];
            return token ? raw : null;
          } catch {
            return null;
          }
        });
        if (payload) return payload;
      } catch {
        // Ignore transient execution-context errors during redirects.
      }

      await sleep(500);
    }

    return null;
  }

  private async showSuccessToast(page: import("playwright").Page): Promise<void> {
    await page.evaluate(() => {
      const toast = document.createElement("div");
      toast.style.cssText = [
        "position:fixed",
        "bottom:24px",
        "right:24px",
        "background:#16a34a",
        "color:#fff",
        "border-radius:10px",
        "padding:12px 18px",
        "font-family:Segoe UI,Arial,sans-serif",
        "font-size:14px",
        "font-weight:600",
        "box-shadow:0 4px 16px rgba(0,0,0,.2)",
        "z-index:2147483647",
        "opacity:1",
        "transition:opacity .4s",
      ].join(";");
      toast.textContent = "✅ 포털 인증이 저장되었습니다.";
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = "0"; }, 3000);
      setTimeout(() => { toast.remove(); }, 3500);
    }).catch(() => {
      // 페이지 상태 문제로 toast 삽입 실패해도 무시
    });
  }

  logout(): void {
    this.store.clear();
  }
}
