# tlc-portal-mcp

TwolineCloud 사내 포탈의 휴가 기능을 Claude Code와 Codex에서 사용할 수 있게 만든 로컬 `stdio` 기반 MCP 서버입니다.

브라우저에서 직접 로그인과 MFA를 완료한 뒤, 잔여 휴가 조회, 휴가 신청 내역 조회, 휴가 신청 준비/제출, 휴가 취소 같은 작업을 MCP 도구로 사용할 수 있습니다.

## 무엇을 할 수 있나

- 포탈 로그인 후 인증 상태 저장
- 현재 잔여 휴가 조회
- 기간별 휴가 신청 내역 조회
- 휴가 신청 초안 준비
- 준비된 휴가 신청 제출
- 기존 휴가 신청 취소

## 왜 이 방식인가

이 프로젝트는 원격 HTTP MCP가 아니라 로컬 `stdio` MCP입니다.

- 사용자 인증 정보를 중앙 서버에 모으지 않습니다.
- 포탈 JWT와 세션은 로컬에서만 다룹니다.
- Node.js 기반이라 Python 설치 없이 사용할 수 있습니다.
- 나중에 `npx` 기반 배포로도 연결할 수 있습니다.

## 요구 사항

- Node.js `18+`
- 브라우저에서 사내 포탈 로그인 가능
- 프로젝트 폴더 전체

## 설치

```bash
npm install
npm run build
npx playwright install chromium
```

## MCP 등록

### Claude Code / Codex

워크스페이스 루트의 `.mcp.json` 또는 각 클라이언트 설정에 아래와 같이 등록합니다.

```json
{
  "mcpServers": {
    "tlc-portal-mcp": {
      "command": "node",
      "args": ["C:\\Users\\{username}\\tlc-portal-mcp\\dist\\server.js"],
      "env": {
        "PORTAL_BASE_URL": "https://portal.twolinecloud.com",
        "PORTAL_LOGIN_PATH": "/",
        "PORTAL_LOGIN_SUCCESS_URL": "/dashboard/landing"
      }
    }
  }
}
```

경로는 실제 설치 위치에 맞게 수정하면 됩니다.

### npx 사용 예시

npm 패키지로 배포했다면 아래처럼 연결할 수 있습니다.

```json
{
  "mcpServers": {
    "tlc-portal-mcp": {
      "command": "npx",
      "args": ["-y", "tlc-portal-mcp"],
      "env": {
        "PORTAL_BASE_URL": "https://portal.twolinecloud.com",
        "PORTAL_LOGIN_PATH": "/",
        "PORTAL_LOGIN_SUCCESS_URL": "/dashboard/landing"
      }
    }
  }
}
```

## 인증 방법

### 권장 방식: `auth.login`

처음 한 번 로그인하면 됩니다. 로그인 후 저장된 JWT를 이후 요청에서 재사용합니다.

1. `auth.login` 실행
2. 브라우저 창이 열리면 포탈 로그인과 MFA 완료
3. 로그인 성공 후 토큰 자동 저장
4. `auth.status`로 인증 상태 확인

성공 시 브라우저에는 안내 메시지가 표시되고, 기본적으로 자동 종료됩니다. 필요하면 `창 유지`를 눌러 자동 종료를 멈출 수 있습니다.

### 대체 방식: `auth.import_vuex`

환경 제약으로 `auth.login`이 동작하지 않으면 수동 import를 사용할 수 있습니다.

1. 브라우저에서 포탈에 직접 로그인
2. DevTools에서 `Application > Local Storage > https://portal.twolinecloud.com` 으로 이동
3. `vuex` 값 복사
4. `auth.import_vuex` 실행 후 붙여 넣기

## 사용 가능한 도구

### 인증

| 도구 | 설명 |
|------|------|
| `auth.login` | 브라우저를 열고 로그인 후 JWT를 자동 저장 |
| `auth.import_vuex` | `localStorage['vuex']` 값을 직접 넣어 인증 |
| `auth.status` | 현재 인증 상태 확인 |
| `auth.clear` | 저장된 인증 상태 초기화 |

### 휴가

| 도구 | 설명 |
|------|------|
| `leave.list_types` | 지원하는 휴가 유형 조회 |
| `leave.get_balances` | 잔여 휴가 조회 |
| `leave.list_requests` | 휴가 신청 내역 조회 |
| `leave.prepare_request` | 휴가 신청 초안 준비 |
| `leave.submit_prepared_request` | 준비된 휴가 신청 제출 |
| `leave.cancel_request` | 휴가 신청 취소 |

## 권장 테스트 순서

1. `auth.status`
2. `auth.login`
3. `auth.status`
4. `leave.get_balances`
5. `leave.list_requests`
6. `leave.prepare_request`
7. `leave.submit_prepared_request`
8. `leave.cancel_request`

쓰기 기능은 실제 포탈 데이터를 변경하므로, 조회 기능이 정상 동작하는지 먼저 확인한 뒤 진행하는 것이 좋습니다.

## 사용 예시

```text
"내 휴가 몇 개 남았어?"
-> leave.get_balances

"이번 달 휴가 신청 내역 보여줘"
-> leave.list_requests

"4월 30일 오전 반차 신청해줘"
-> leave.prepare_request -> leave.submit_prepared_request

"방금 신청한 건 취소해줘"
-> leave.cancel_request
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORTAL_BASE_URL` | `https://portal.example.internal` | 포탈 주소 |
| `PORTAL_LOGIN_PATH` | `/login` | 로그인 진입 경로 |
| `PORTAL_LOGIN_SUCCESS_URL` | `/dashboard/landing` | 로그인 성공 후 도달 URL |
| `PORTAL_MCP_SESSION_FILE` | `.portal-session.json` | 로컬 세션 저장 파일 |
| `PORTAL_TIMEOUT_SECONDS` | `15` | API 요청 타임아웃(초) |

## 제약 사항

- JWT 유효 시간은 현재 기준 약 2시간입니다.
- 토큰이 만료되면 `auth.login`을 다시 실행해야 합니다.
- Refresh 토큰은 사용하지 않습니다.
- 세션 파일은 로컬에만 저장되며 서버로 전송하지 않습니다.
- 휴가 신청은 `prepare -> submit` 흐름을 기본으로 사용합니다.

## 문서

- [docs/api-spec.md](C:\Users\min\Desktop\ai\tlc-portal-mcp\docs\api-spec.md)
- [docs/leave-roadmap.md](C:\Users\min\Desktop\ai\tlc-portal-mcp\docs\leave-roadmap.md)
- [WORKLOG.md](C:\Users\min\Desktop\ai\tlc-portal-mcp\WORKLOG.md)
