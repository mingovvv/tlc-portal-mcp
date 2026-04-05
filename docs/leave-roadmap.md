# Leave Domain Roadmap

## Purpose

이 문서는 사내 포탈의 `휴가` 도메인을 MCP로 연결하기 위한 전체 구현 로드맵을 관리한다.
목표는 단순한 휴가 신청 스크립트가 아니라, 휴가 관련 조회와 쓰기 작업을 안전하게 수행할 수 있는
`stdio` 기반 MCP 기능 세트를 만드는 것이다.

> **이 프로젝트는 `portal-mcp` (Python)의 TypeScript 포팅 버전이다.**
> `npx tlc-portal-mcp` 한 줄로 Node.js 환경에서 바로 실행할 수 있도록 배포를 목표로 한다.

## Product Goal

- 사용자가 자연어로 휴가 관련 작업을 요청할 수 있다.
- MCP는 포탈의 실제 HTTP 요청을 재현해 휴가 조회와 신청을 수행한다.
- 민감한 write 작업은 항상 `prepare -> confirm -> submit` 흐름을 따른다.
- 추후 다른 작업자가 이어받아도 구현 위치와 남은 과제를 바로 이해할 수 있다.

## Scope

### In Scope

- 휴가 유형 조회
- 잔여 휴가 조회
- 내 휴가 신청 내역 조회
- 휴가 신청 준비
- 휴가 신청 제출
- 제출된 휴가의 상태 조회
- 취소 가능한 휴가 취소

### Out of Scope For Now

- 결재 도메인
- 브라우저 자동화 기반 fallback
- 다중 사용자 공용 서버 운영
- 조직 정책 엔진이나 승인 라인 변경 자동화

## Target User Experience

### Read Examples

- "내 연차 잔여 일수 알려줘"
- "이번 달 휴가 신청 내역 보여줘"
- "반차로 쓸 수 있는 휴가 유형 알려줘"

### Write Examples

- "4월 18일 오전 반차 올려줘"
- "다음 주 월요일부터 수요일까지 연차 신청 준비해줘"
- "방금 준비한 휴가 신청 제출해줘"
- "신청번호 12345 휴가 취소해줘"

## Architecture

### Design Principles

1. MCP 레이어와 포탈 비즈니스 로직을 분리한다.
2. 포탈 공통 인증, 세션, HTTP 처리는 재사용 가능해야 한다.
3. 업무 기능은 화면이 아니라 도메인 기준으로 나눈다.
4. 모든 write 작업은 가능한 한 사전 검증 단계를 거친다.

### Layers

```
User Request
  -> MCP Tool (server.ts)
  -> Leave Service (domains/leave/service.ts)
  -> Portal HTTP Client (core/http-client.ts)
  -> Internal Portal HTTP Requests
  -> Domain Model Result
```

### Directory Structure

```
tlc-portal-mcp/
  package.json
  tsconfig.json
  README.md
  WORKLOG.md
  docs/
    api-spec.md
    leave-roadmap.md
  src/
    server.ts          # MCP 서버 진입점
    core/
      config.ts        # 환경변수 기반 설정
      errors.ts        # 공통 예외 계층
      session-store.ts # 로컬 파일 세션 저장
      auth.ts          # 인증 관리 (Playwright 로그인)
      http-client.ts   # 포탈 HTTP 래퍼
    domains/
      leave/
        models.ts      # 휴가 도메인 모델
        service.ts     # 휴가 비즈니스 로직
    tools/
      auth-tools.ts    # MCP auth tool 핸들러
      leave-tools.ts   # MCP leave tool 핸들러
```

## MCP Tool Map

### Auth

- `auth.login` — 브라우저 로그인 후 JWT 자동 저장
- `auth.import_vuex` — localStorage['vuex'] 수동 입력
- `auth.status` — 현재 인증 상태 확인
- `auth.clear` — 저장된 세션 삭제

### Leave

- `leave.list_types` — 휴가 유형 목록
- `leave.get_balances` — 잔여 휴가 조회
- `leave.list_requests` — 신청 내역 조회
- `leave.prepare_request` — 신청 준비
- `leave.submit_prepared_request` — 신청 제출
- `leave.cancel_request` — 신청 취소

## Confirmed Findings

### Authentication

- 로그인 방식: `ID/PW + MFA(Authenticator 코드 입력)`
- JWT는 `localStorage['vuex']` → `authority.token` 경로에 저장
- 로그인 성공 리다이렉트: `https://portal.twolinecloud.com/dashboard/landing`
- JWT 클레임: `{ employeeId, permission, otp, exp, iat }`
- 토큰 유효시간: 약 2시간 (`exp - iat = 7200s`)
- Refresh 없음 — 만료 시 재로그인 필요

### API Auth Rule

- 모든 요청: `Authorization: <token>` (Bearer 접두사 없음)

### Confirmed Endpoints

- `GET /api/vacation-svc/manage/{employeeId}`
- `GET /api/vacation-svc/request/secure`
- `GET /api/vacation-svc/request/admit`
- `POST /api/vacation-svc/request`
- `DELETE /api/vacation-svc/request/{vacationRequestId}`

## Current Status

- Phase 0 완료 (도메인 정의)
- Phase 1 완료 (코어 기반)
- Phase 2 완료 (서비스 계층)
- Phase 3 완료 (포탈 리버스 엔지니어링)
- Phase 4 완료 (조회 기능 실제 연동)
- Phase 5 완료 (신청/제출 기능)
- Phase 6 완료 (취소 기능)
- Phase 7 완료 (MCP 서버 연결)
- **TypeScript 포팅 완료**

## Working Rules

- 코드 변경 시 `WORKLOG.md`와 관련 설계 문서를 함께 갱신한다.
- placeholder 구현인지 실제 포탈 연동인지 상태를 항상 명시한다.
- write 기능은 `prepare -> confirm -> submit` 흐름을 벗어나지 않는다.
