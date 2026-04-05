/**
 * 로컬 파일 기반 세션 저장소.
 * 인증 토큰과 사용자 식별 정보를 JSON 파일로 유지한다.
 */

import fs from "node:fs";
import path from "node:path";

export interface PortalSession {
  authenticated: boolean;
  jwtToken: string | null;
  csrfToken: string | null;
  cookies: Record<string, string>;
  employeeId: number | null;
}

const DEFAULT_SESSION: PortalSession = {
  authenticated: false,
  jwtToken: null,
  csrfToken: null,
  cookies: {},
  employeeId: null,
};

export class FileSessionStore {
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
  }

  load(): PortalSession {
    if (!fs.existsSync(this.filePath)) {
      return { ...DEFAULT_SESSION };
    }
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      return { ...DEFAULT_SESSION, ...JSON.parse(raw) } as PortalSession;
    } catch {
      return { ...DEFAULT_SESSION };
    }
  }

  save(session: PortalSession): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(session, null, 2), "utf-8");
  }

  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}
