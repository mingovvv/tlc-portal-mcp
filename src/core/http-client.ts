/**
 * 포탈 HTTP 요청 공통 래퍼.
 * Authorization 헤더 자동 주입, 재시도, 에러 정규화를 담당한다.
 */

import type { PortalConfig } from "./config.js";
import { PortalRequestError } from "./errors.js";
import type { FileSessionStore, PortalSession } from "./session-store.js";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class PortalHttpClient {
  constructor(
    private readonly config: PortalConfig,
    private readonly store: FileSessionStore
  ) {}

  buildUrl(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, "");
    const p = path.replace(/^\//, "");
    return `${base}/${p}`;
  }

  private buildHeaders(session?: PortalSession | null): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": this.config.userAgent,
      "Content-Type": "application/json",
    };
    if (session?.jwtToken) {
      // 포탈은 Bearer 접두사 없이 토큰만 사용한다
      headers["Authorization"] = session.jwtToken;
    }
    return headers;
  }

  private async request(
    method: string,
    path: string,
    opts: { body?: unknown; session?: PortalSession | null } = {}
  ): Promise<Response> {
    const url = this.buildUrl(path);
    const headers = this.buildHeaders(opts.session);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        });

        if (!res.ok) {
          throw new PortalRequestError(
            `포탈 요청 실패: ${method} ${url} → ${res.status}`
          );
        }
        return res;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < MAX_RETRIES - 1) await sleep(RETRY_DELAY_MS);
      }
    }
    throw lastError!;
  }

  async get(path: string, session?: PortalSession | null): Promise<Response> {
    return this.request("GET", path, { session });
  }

  async post(
    path: string,
    body: unknown,
    session?: PortalSession | null
  ): Promise<Response> {
    return this.request("POST", path, { body, session });
  }

  async delete(path: string, session?: PortalSession | null): Promise<Response> {
    return this.request("DELETE", path, { session });
  }
}
