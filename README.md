# tlc-portal-mcp

TwolineCloud 포털의 휴가와 타임테이블 기능을 Claude Code, Codex 같은 MCP 클라이언트에서 사용할 수 있게 만든 `stdio` 기반 MCP 서버입니다.

패키지를 `npx`로 실행하면 브라우저 로그인, 휴가 조회/신청, 타임테이블 조회/입력, 버전 진단 같은 작업을 MCP 도구로 사용할 수 있습니다.

## 현재 지원 기능

- 포털 로그인과 인증 상태 확인
- 휴가 유형, 잔여 휴가, 휴가 신청 이력 조회
- 휴가 신청 준비, 제출, 취소
- 타임테이블 관리 정보, 입력 가능 기간, 일별 상세 조회
- 타임테이블 프로젝트 목록 조회
- 휴가를 반영한 일별 입력 가능 시간 계산
- 타임테이블 단건/기간 입력 준비 및 제출
- 타임테이블 일별 전체 삭제
- 현재 서버 버전 확인 및 npm 최신 버전 비교

## 요구 사항

- Node.js `18+`
- 포털 로그인이 가능한 브라우저 환경
- 최초 설치 시 Playwright Chromium 다운로드 가능 환경

## 설치 및 등록

### Claude Code

```bash
# 사용자 전역 등록
claude mcp add tlc-portal-mcp --scope user -- npx -y tlc-portal-mcp

# 현재 프로젝트에만 등록
claude mcp add tlc-portal-mcp -- npx -y tlc-portal-mcp
```

### Codex CLI

```bash
# 기본 등록
codex mcp add tlc-portal-mcp -- npx -y tlc-portal-mcp
```

Codex는 현재 프로젝트 전용 `add` 명령이 별도로 없을 수 있으므로, 필요하면 프로젝트 루트의 `.codex/config.toml`에 직접 추가할 수 있습니다.

```toml
[mcp_servers.tlc-portal-mcp]
command = "npx"
args = ["-y", "tlc-portal-mcp"]
```

## 실행 방식 메모

- `mcp add ... -- npx -y tlc-portal-mcp`는 전역 설치가 아니라 실행 명령 등록입니다.
- 실제 패키지 다운로드는 클라이언트가 서버를 처음 실행할 때 일어납니다.
- 매번 새로 설치하는 것은 아니고, 실행 환경에 따라 캐시된 버전이 재사용될 수 있습니다.
- 그래서 서버에는 현재 버전과 최신 버전을 확인하는 `system.*` 도구가 포함되어 있습니다.

## 인증 방법

### 권장: `auth.login`

브라우저를 열어 사용자가 직접 로그인하면 `localStorage['vuex']`의 JWT를 자동 저장합니다.

1. `auth.login` 실행
2. 브라우저에서 포털 로그인과 MFA 완료
3. 로그인 성공 후 토큰 자동 저장
4. `auth.status`로 인증 상태 확인

로그인 성공 후 브라우저에는 안내 오버레이가 표시되고, 기본적으로 5초 후 자동 종료됩니다. 더 확인하려면 `창 유지`를 누르면 됩니다.

### 대체: `auth.import_vuex`

자동 로그인 흐름을 쓰기 어렵다면 브라우저에서 `vuex` 값을 직접 가져와 붙여넣을 수 있습니다.

1. 브라우저에서 포털 로그인
2. DevTools에서 `Application > Local Storage > https://portal.twolinecloud.com` 이동
3. `vuex` 값 복사
4. `auth.import_vuex` 실행 후 붙여넣기

## 도구 목록

### 시스템

| Tool | 설명 |
|------|------|
| `system.info` | 현재 실행 중인 서버 이름, 버전, 등록된 도구 목록 반환 |
| `system.check_update` | npm 최신 버전과 현재 버전을 비교 |

### 인증

| Tool | 설명 |
|------|------|
| `auth.login` | 브라우저 로그인 후 JWT 자동 저장 |
| `auth.import_vuex` | `localStorage['vuex']`를 붙여넣어 인증 |
| `auth.status` | 현재 인증 상태 확인 |
| `auth.clear` | 로컬 세션 삭제 |

### 휴가

| Tool | 설명 |
|------|------|
| `leave.list_types` | 지원하는 휴가 유형 조회 |
| `leave.get_balances` | 잔여 휴가 조회 |
| `leave.list_requests` | 휴가 신청 이력 조회 |
| `leave.prepare_request` | 휴가 신청 payload 준비 |
| `leave.submit_prepared_request` | 준비된 휴가 신청 제출 |
| `leave.cancel_request` | 기존 휴가 신청 취소 |

### 타임테이블

| Tool | 설명 |
|------|------|
| `timetable.get_manage_info` | 타임테이블 관리/마감 정보 조회 |
| `timetable.get_user_summary` | 현재 사용자의 타임테이블 현황 조회 |
| `timetable.get_available_range` | 입력 가능 기간 조회 |
| `timetable.get_day` | 특정 날짜 타임테이블 상세 조회 |
| `timetable.get_range_overview` | 날짜 범위 전체를 타임테이블 + 공휴일/휴가 capacity와 함께 요약 |
| `timetable.list_projects` | 타임테이블에 입력 가능한 프로젝트 목록 조회 |
| `timetable.get_day_capacity` | 휴가를 반영한 해당 날짜 입력 가능 시간 계산 |
| `timetable.prepare_day_entry` | 단일 날짜 타임테이블 입력 준비 |
| `timetable.submit_prepared_day_entry` | 준비된 단일 날짜 입력 제출 |
| `timetable.prepare_bulk_entries` | 기간 기준 일괄 입력 준비 |
| `timetable.submit_prepared_bulk_entries` | 준비된 일괄 입력 제출 |
| `timetable.clear_day` | 특정 날짜 타임테이블 전체 삭제 |

## 타임테이블 규칙

- 기본 입력 가능 시간은 하루 8시간입니다.
- 반차(`AM`, `PM`, `admitAm`, `admitPm`)가 있으면 최대 4시간만 기록할 수 있습니다.
- 종일 휴가(`allDay`, `admit`)가 있으면 해당 날짜에는 기록할 수 없습니다.
- 한국 공휴일은 기본적으로 Nager.Date API에서 조회하고, 실패 시 내장 fallback 데이터를 사용합니다.
- 주말과 회사 공통 휴무일(`PORTAL_COMPANY_HOLIDAYS`)도 입력 불가로 처리합니다.
- 개인 휴가 overlay는 포털 overview 규칙에 맞춰 `vacation-svc/request/secure`의 `requestDt` 정렬 결과를 기준으로 계산합니다.
- `workDate`와 `taskType`은 항상 필요합니다.
- `projectId`는 기본적으로 필요합니다.
- 단, `taskType === NORMAL`이면 `projectId` 없이 입력할 수 있습니다.
- 쓰기 작업은 `prepare -> submit` 흐름을 따릅니다.

## 권장 사용 순서

### 초기 진단

1. `system.info`
2. `system.check_update`
3. `auth.status`
4. 필요 시 `auth.login`

### 휴가 흐름

1. `leave.get_balances`
2. `leave.list_requests`
3. `leave.prepare_request`
4. `leave.submit_prepared_request`

### 타임테이블 흐름

1. `timetable.get_available_range`
2. `timetable.get_range_overview`
3. `timetable.list_projects`
4. `timetable.get_day_capacity`
5. `timetable.prepare_day_entry` 또는 `timetable.prepare_bulk_entries`
6. `timetable.submit_prepared_day_entry` 또는 `timetable.submit_prepared_bulk_entries`

## 사용 예시

```text
"현재 서버 버전이랑 최신 버전 비교해줘"
-> system.check_update

"내 휴가 잔여 일수 보여줘"
-> leave.get_balances

"이번 달 휴가 신청 이력 보여줘"
-> leave.list_requests

"4월 30일 오전 반차 신청 준비해줘"
-> leave.prepare_request

"오늘 입력 가능한 타임테이블 시간 계산해줘"
-> timetable.get_day_capacity

"2026년 2월 타임테이블 전체를 공휴일 포함해서 요약해줘"
-> timetable.get_range_overview

"2026-04-05에 프로젝트 274로 4시간, taskType EXECUTE로 입력 준비해줘"
-> timetable.prepare_day_entry

"오늘 일반업무 2시간, taskType NORMAL로 입력 준비해줘"
-> timetable.prepare_day_entry

"4월 1일부터 4월 3일까지 같은 내용으로 일괄 입력 준비해줘"
-> timetable.prepare_bulk_entries
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORTAL_BASE_URL` | `https://portal.twolinecloud.com` | 포털 기본 주소 |
| `PORTAL_LOGIN_PATH` | `/` | 로그인 진입 경로 |
| `PORTAL_LOGIN_SUCCESS_URL` | `/dashboard/landing` | 로그인 성공 후 도달 URL |
| `PORTAL_MCP_SESSION_FILE` | `.portal-session.json` | 로컬 세션 저장 파일 |
| `PORTAL_TIMEOUT_SECONDS` | `15` | API 요청 타임아웃 초 |
| `PORTAL_COMPANY_HOLIDAYS` | `` | 쉼표로 구분한 회사 공통 휴무일 목록 (`YYYY-MM-DD,YYYY-MM-DD`) |
| `PORTAL_HOLIDAY_API_BASE_URL` | `https://date.nager.at/api/v3` | 한국 공휴일 조회 API base URL |

## 제한 사항

- JWT 유효 시간은 현재 기준 약 2시간입니다.
- 토큰이 만료되면 `auth.login` 또는 `auth.import_vuex`를 다시 실행해야 합니다.
- Refresh token은 사용하지 않습니다.
- 세션 파일은 로컬에만 저장되며 서버로 업로드되지 않습니다.
- `system.check_update`는 npm registry 접근이 가능한 환경에서만 최신 버전을 확인할 수 있습니다.
- 공휴일 조회 API가 실패하면 내장 fallback 데이터로 판정합니다.
- 타임테이블의 `NORMAL` + `projectId` 없음 조합은 문서 기준 허용 흐름으로 구현되어 있지만, 실제 포털 백엔드 수용 여부는 운영 환경에서 추가 확인이 필요합니다.

## 문서

- [docs/api-spec.md](docs/api-spec.md)
- [docs/leave-roadmap.md](docs/leave-roadmap.md)
- [docs/timetable-roadmap.md](docs/timetable-roadmap.md)
- [WORKLOG.md](WORKLOG.md)
