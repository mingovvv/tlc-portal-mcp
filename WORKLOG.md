# Worklog

## 2026-04-05

### Decision

- `portal-mcp` (Python/stdio) 의 TypeScript 포팅 버전으로 시작한다.
- 전송 방식은 동일하게 `stdio`를 사용한다.
- 언어를 TypeScript로 바꾸는 이유: `npx tlc-portal-mcp` 한 줄 실행으로
  Node.js만 있으면 되므로 사용자가 Python/venv 등을 별도 설치할 필요가 없다.
- 초기 기능 범위는 `portal-mcp`와 동일하게 휴가 도메인 전체다.

### Python → TypeScript 포팅 내역

- `core/config.py` → `core/config.ts`
- `core/errors.py` → `core/errors.ts`
- `core/session_store.py` → `core/session-store.ts`
- `core/auth.py` → `core/auth.ts`
  - Python 버전의 `ThreadPoolExecutor` 우회 코드 제거
  - Playwright TypeScript는 asyncio 이슈가 없으므로 그냥 `await` 사용
- `core/http_client.py` → `core/http-client.ts`
  - `httpx` → `fetch` (Node.js 내장)
  - `tenacity` retry → 직접 구현 (3회, 1초 간격)
  - `beautifulsoup4` 의존성 제거 (현재 HTML 파싱 불필요)
- `domains/leave/models.py` → `domains/leave/models.ts`
  - `pydantic` → `zod`
- `domains/leave/service.py` → `domains/leave/service.ts`
- `tools/auth_tools.py` → `tools/auth-tools.ts`
- `tools/leave_tools.py` → `tools/leave-tools.ts`
- `mcp_server.py` + `server.py` → `server.ts` (통합)
  - `FastMCP` → `@modelcontextprotocol/sdk McpServer`

### Key Improvements Over Python Version

- ThreadPoolExecutor 핵 제거 — TypeScript Playwright는 async-native
- fetch 내장 사용 — httpx 의존성 없음
- 단일 파일 진입점 (`server.ts`) — app/mcp_server 분리 불필요

### Current Project Shape

```
src/
  server.ts          # MCP 서버 + tool 등록
  core/              # 인증, 세션, HTTP 처리
  domains/leave/     # 휴가 도메인 로직
  tools/             # MCP tool 핸들러
```

### Next Steps

1. `npm install` 후 `npm run build` 검증
2. `playwright install chromium`
3. `.mcp.json` 등록 후 Claude Code에서 동작 확인
4. `auth.login` → `leave.get_balances` 플로우 테스트
