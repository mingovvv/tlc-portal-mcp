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

      await page.waitForResponse(
        (response) =>
          response.url().includes("/account/otp/auth") &&
          response.status() === 200,
        { timeout: timeoutSeconds * 1000 }
      );

      await sleep(1500);

      const vuexPayload = await this.waitForVuexPayload(page, 15000);

      if (!vuexPayload) {
        throw new AuthenticationFlowError(
          "OTP 인증은 완료됐지만 localStorage['vuex'].authority.token 값을 찾지 못했습니다.",
          { loginUrl, successUrl }
        );
      }

      const session = this.importVuexState(vuexPayload);
      await this.showSuccessOverlay(page);
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

  private async showSuccessOverlay(page: import("playwright").Page): Promise<void> {
    await page.evaluate(() => {
      const existing = document.getElementById("tlc-mcp-login-success-overlay");
      if (existing) {
        existing.remove();
      }

      const backdrop = document.createElement("div");
      backdrop.id = "tlc-mcp-login-success-overlay";
      backdrop.style.cssText = [
        "position:fixed",
        "inset:0",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "padding:24px",
        "background:radial-gradient(circle at top, rgba(15,23,42,0.12), rgba(15,23,42,0.34))",
        "backdrop-filter:blur(10px)",
        "z-index:2147483647",
        "font-family:'Segoe UI','Noto Sans KR',sans-serif",
      ].join(";");

      const panel = document.createElement("section");
      panel.style.cssText = [
        "position:relative",
        "width:min(480px, calc(100vw - 32px))",
        "padding:30px 30px 26px",
        "border-radius:28px",
        "background:linear-gradient(145deg, rgba(255,255,255,0.97), rgba(248,250,252,0.95))",
        "border:1px solid rgba(148,163,184,0.18)",
        "box-shadow:0 28px 90px rgba(15,23,42,0.28)",
        "overflow:hidden",
        "color:#0f172a",
      ].join(";");

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.setAttribute("aria-label", "안내 닫기");
      closeButton.style.cssText = [
        "position:absolute",
        "top:16px",
        "right:16px",
        "width:36px",
        "height:36px",
        "border:none",
        "border-radius:999px",
        "background:rgba(148,163,184,0.14)",
        "color:#334155",
        "font-size:22px",
        "line-height:1",
        "cursor:pointer",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "transition:background .2s ease, transform .2s ease",
      ].join(";");
      closeButton.textContent = "×";
      closeButton.addEventListener("mouseenter", () => {
        closeButton.style.background = "rgba(148,163,184,0.24)";
        closeButton.style.transform = "scale(1.04)";
      });
      closeButton.addEventListener("mouseleave", () => {
        closeButton.style.background = "rgba(148,163,184,0.14)";
        closeButton.style.transform = "scale(1)";
      });
      closeButton.addEventListener("click", () => {
        backdrop.remove();
      });

      const glow = document.createElement("div");
      glow.style.cssText = [
        "position:absolute",
        "top:-110px",
        "right:-60px",
        "width:220px",
        "height:220px",
        "border-radius:999px",
        "background:radial-gradient(circle, rgba(16,185,129,0.28), rgba(16,185,129,0))",
        "pointer-events:none",
      ].join(";");

      const badge = document.createElement("div");
      badge.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "gap:8px",
        "padding:8px 12px",
        "border-radius:999px",
        "background:rgba(15,118,110,0.08)",
        "color:#0f766e",
        "font-size:12px",
        "font-weight:700",
        "letter-spacing:0.08em",
        "text-transform:uppercase",
      ].join(";");
      badge.textContent = "Portal Session Ready";

      const title = document.createElement("h1");
      title.style.cssText = [
        "margin:18px 0 10px",
        "font-size:30px",
        "line-height:1.12",
        "font-weight:800",
        "letter-spacing:-0.04em",
      ].join(";");
      title.textContent = "로그인 연결 완료";

      const body = document.createElement("p");
      body.style.cssText = [
        "margin:0",
        "font-size:16px",
        "line-height:1.7",
        "color:#334155",
      ].join(";");
      body.textContent =
        "TwolineCloud Portal 세션이 MCP 서버에 연결되었습니다.";

      const footnote = document.createElement("p");
      footnote.style.cssText = [
        "margin:14px 0 0",
        "font-size:14px",
        "line-height:1.6",
        "color:#475569",
      ].join(";");
      footnote.textContent = "원하시면 이 페이지를 닫아도 됩니다.";

      const accent = document.createElement("div");
      accent.style.cssText = [
        "margin-top:22px",
        "height:4px",
        "border-radius:999px",
        "background:linear-gradient(90deg, #0f766e 0%, #10b981 55%, #99f6e4 100%)",
      ].join(";");

      panel.appendChild(closeButton);
      panel.appendChild(glow);
      panel.appendChild(badge);
      panel.appendChild(title);
      panel.appendChild(body);
      panel.appendChild(footnote);
      panel.appendChild(accent);
      backdrop.appendChild(panel);
      document.body.appendChild(backdrop);
    }).catch(() => {
      // 페이지 상태 문제로 안내 UI 주입 실패해도 무시
    });
  }

  logout(): void {
    this.store.clear();
  }
}
