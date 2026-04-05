/**
 * 인증 상태 관리.
 *
 * interactive_login은 Playwright를 사용해 headed 브라우저를 열고
 * 사용자가 직접 로그인 및 MFA를 완료하면 JWT를 자동 수집한다.
 *
 * TypeScript + Playwright는 asyncio 이슈가 없으므로
 * Python 버전에서 필요했던 ThreadPoolExecutor 우회 코드가 불필요하다.
 */

import { chromium } from "playwright";
import type { PortalConfig } from "./config.js";
import {
  AuthenticationFlowError,
  AuthenticationRequiredError,
} from "./errors.js";
import type { FileSessionStore, PortalSession } from "./session-store.js";

export class PortalAuthManager {
  constructor(
    private readonly config: PortalConfig,
    private readonly store: FileSessionStore
  ) {}

  getSession(): PortalSession {
    return this.store.load();
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

  /**
   * JWT payload(base64url)를 디코딩해 employeeId 클레임을 추출한다.
   * 서명 검증 없이 payload만 파싱한다.
   */
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
          if (!isNaN(parsed)) return parsed;
        }
      }
    } catch {
      // 파싱 실패 시 null 반환
    }
    return null;
  }

  importVuexState(vuexPayload: string): PortalSession {
    const parsed = JSON.parse(vuexPayload) as Record<string, unknown>;
    const authority = parsed["authority"] as Record<string, unknown> | undefined;
    const token = authority?.["token"] as string | undefined;

    if (!token) {
      throw new AuthenticationRequiredError(
        "vuex payload에서 authority.token을 찾을 수 없습니다."
      );
    }

    const employeeId = PortalAuthManager.decodeJwtEmployeeId(token);
    return this.markAuthenticated({ jwtToken: token, employeeId });
  }

  async interactiveLogin(timeoutSeconds = 300): Promise<PortalSession> {
    const baseUrl = this.config.baseUrl.replace(/\/$/, "");
    const loginUrl = `${baseUrl}/${this.config.loginPath.replace(/^\//, "")}`;
    const successUrl = `${baseUrl}/${this.config.loginSuccessUrl.replace(/^\//, "")}`;

    let browser;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      const page = await context.newPage();

      await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
      await page.waitForURL(`${successUrl}**`, {
        timeout: timeoutSeconds * 1000,
      });

      const vuexPayload = await page.evaluate(
        () => window.localStorage.getItem("vuex")
      );

      if (vuexPayload) {
        await this.showSuccessOverlay(page);
      }

      await browser.close();

      if (!vuexPayload) {
        throw new AuthenticationFlowError(
          "로그인은 완료됐지만 localStorage['vuex']가 비어있습니다.",
          { loginUrl, successUrl }
        );
      }

      return this.importVuexState(vuexPayload);
    } catch (err) {
      if (browser) await browser.close().catch(() => {});
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

  private async showSuccessOverlay(page: import("playwright").Page): Promise<void> {
    await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        let countdown = 3;
        let autoClose = true;

        const overlay = document.createElement("div");
        overlay.style.cssText =
          "position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:2147483647";

        const panel = document.createElement("div");
        panel.style.cssText =
          "width:min(92vw,420px);background:#fff;border-radius:18px;box-shadow:0 18px 48px rgba(15,23,42,.22);padding:24px;font-family:Segoe UI,Arial,sans-serif;color:#0f172a";

        const title = document.createElement("div");
        title.textContent = "로그인 성공";
        title.style.cssText = "font-size:24px;font-weight:700;margin-bottom:12px";

        const message = document.createElement("div");
        message.style.cssText = "font-size:14px;line-height:1.6;margin-bottom:18px";

        const buttonRow = document.createElement("div");
        buttonRow.style.cssText = "display:flex;gap:12px;justify-content:flex-end";

        const keepBtn = document.createElement("button");
        keepBtn.textContent = "창 유지";
        keepBtn.style.cssText =
          "border:1px solid #cbd5e1;background:#fff;color:#0f172a;border-radius:10px;padding:10px 14px;cursor:pointer";

        const closeBtn = document.createElement("button");
        closeBtn.style.cssText =
          "border:none;background:#2563eb;color:#fff;border-radius:10px;padding:10px 14px;cursor:pointer";

        const render = () => {
          if (autoClose) {
            message.textContent = `포털 인증이 저장되었습니다. 이 창은 ${countdown}초 후 자동으로 닫힙니다.`;
            closeBtn.textContent = "지금 닫기";
            keepBtn.style.display = "inline-block";
          } else {
            message.textContent =
              "포털 인증이 저장되었습니다. 자동 종료가 멈췄습니다. 확인 후 완료를 누르면 창이 닫힙니다.";
            closeBtn.textContent = "완료";
            keepBtn.style.display = "none";
          }
        };

        render();

        const timer = setInterval(() => {
          if (!autoClose) return;
          countdown -= 1;
          if (countdown <= 0) {
            clearInterval(timer);
            resolve("auto_close");
            return;
          }
          render();
        }, 1000);

        keepBtn.addEventListener("click", () => {
          autoClose = false;
          render();
        });

        closeBtn.addEventListener("click", () => {
          clearInterval(timer);
          resolve(autoClose ? "close_now" : "done");
        });

        buttonRow.appendChild(keepBtn);
        buttonRow.appendChild(closeBtn);
        panel.appendChild(title);
        panel.appendChild(message);
        panel.appendChild(buttonRow);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
      });
    });
  }

  logout(): void {
    this.store.clear();
  }
}
