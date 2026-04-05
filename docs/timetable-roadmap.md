# Timetable Domain Roadmap

## Purpose

이 문서는 TwolineCloud 포털의 `타임테이블` 영역을 MCP 도구로 연결하기 위한 구현 로드맵이다.
목표는 단순한 HTTP 래퍼가 아니라, 휴가 정보와 타임테이블 제약을 함께 반영하는 안전한 입력 도구 세트를 만드는 것이다.

타임테이블은 휴가와 강하게 연결된다. 기본 근무시간은 8시간이지만, 반차를 사용한 날은 4시간만 기록할 수 있어야 하고, 연차를 사용한 날은 타임테이블을 기록하면 안 된다.

## Product Goal

- 사용자가 자연어로 타임테이블 조회와 입력 작업을 요청할 수 있다.
- MCP가 포털 API를 호출하되, 휴가 상태를 반영해 잘못된 입력을 사전에 막는다.
- 날짜와 `taskType` 선택은 항상 강제한다.
- 수행 프로젝트 선택은 기본적으로 강제하되, `기타(일반업무)`에 해당하는 `NORMAL`일 때만 예외로 허용한다.
- write 작업은 검증 가능한 흐름으로 분리해 실수 입력을 줄인다.

## Scope

### In Scope

- 타임테이블 입력 가능 기간 조회
- 사용자 타임테이블 현황 조회
- 특정 날짜 타임테이블 상세 조회
- 프로젝트 목록 조회
- 단일 날짜 타임테이블 입력/수정/삭제
- 기간 기준 타임테이블 일괄 입력
- 휴가 정보와 결합한 입력 가능 시간 계산

### Out of Scope For Now

- 승인/결재 흐름 자동화
- 포털 UI 복제 수준의 캘린더 렌더링
- 프로젝트 검색 고도화
- 프로젝트 자동 추천/기본 선택

## Key Business Rules

### Time Capacity

- 기본 입력 가능 시간은 하루 8시간이다.
- 반차(`AM`, `PM`, `admitAm`, `admitPm`)가 있으면 해당 날짜 총 입력 가능 시간은 4시간이다.
- 연차/인정연차 종일(`allDay`, `admit`)이 있으면 해당 날짜는 타임테이블 입력 불가다.
- 총 `workTime` 합계가 허용 시간을 초과하면 제출 전에 차단한다.

### Required Fields

- 모든 타임테이블 row는 `workDate`, `taskType`을 가져야 한다.
- `taskType`은 사용자에게 반드시 선택받아야 한다.
- 프로젝트도 기본적으로 사용자에게 반드시 선택받아야 한다.
- 단, `taskType === NORMAL`이면 `projectId` 없이 입력할 수 있다.
- 날짜도 사용자에게 반드시 확인받아야 한다.
- `note`는 선택 입력이다.

### Task Type Policy

- 허용 후보: `EXECUTE`, `AFTER_SVC`, `RESEARCH`, `SUGGEST`, `NORMAL`
- `NORMAL`도 MCP를 통해 직접 입력할 수 있다.
- `NORMAL`이 아니면 `projectId`는 필수다.
- `NORMAL`이면 프로젝트 선택 없이 입력할 수 있다.
- 사용자가 task type을 주지 않으면 임의 기본값을 넣지 않고 다시 확인하거나 준비 단계에서 막는다.

### Safe Write Flow

- 입력계 도구는 `prepare -> confirm -> submit` 흐름을 기본으로 한다.
- submit 직전 다시 한 번 휴가 상태와 총 시간 합계를 검증한다.
- 휴가 데이터와 충돌하면 submit을 막고 이유를 반환한다.

## Target User Experience

### Read Examples

- "이번 주 타임테이블 입력 가능한 날짜 보여줘"
- "2026-04-02 타임테이블 기록 보여줘"
- "내가 선택할 수 있는 프로젝트 목록 보여줘"

### Write Examples

- "오늘 프로젝트 A로 4시간, taskType은 EXECUTE로 타임테이블 준비해줘"
- "오늘 일반업무 2시간, taskType은 NORMAL로 입력 준비해줘"
- "어제 반차였는지 확인해서 입력 가능 시간 계산해줘"
- "4월 1일부터 4월 3일까지 같은 프로젝트로 일괄 입력 준비해줘"
- "방금 준비한 타임테이블 제출해줘"

## Confirmed Endpoints

- `GET /api/attendance-svc/timetable/manage`
- `GET /api/attendance-svc/timetable/user`
- `GET /api/attendance-svc/timetable/manage/available`
- `GET /api/attendance-svc/timetable/{date}`
- `POST /api/attendance-svc/timetable`
- `POST /api/attendance-svc/timetable/list`
- `GET /api/project-svc/project/summary?limit=999999`
- `GET /api/vacation-svc/request/secure`

## Domain Model Notes

### Timetable Entry

- `workDate`
- `projectId`
- `projectName`
- `taskType`
- `workTime`
- `note`

> `projectId`와 `projectName`은 `NORMAL`이 아닌 task type에서만 필수로 취급한다.

### Supporting Context

- 휴가 상태는 타임테이블 API 응답이 아니라 휴가 API에서 보강해야 한다.
- 프로젝트 선택값은 `project summary` 응답의 `value`를 사용한다.
- 프로젝트 표시명은 `label`을 사용한다.

## MCP Tool Map

### Read Tools

- `timetable.get_manage_info`
  타임테이블 관리/마감 관련 기본 정보를 조회한다.
- `timetable.get_user_summary`
  현재 사용자의 타임테이블 입력 현황을 조회한다.
- `timetable.get_available_range`
  입력 가능한 기간을 조회한다.
- `timetable.get_day`
  특정 날짜 타임테이블 상세를 조회한다.
- `timetable.list_projects`
  타임테이블에 사용할 프로젝트 목록을 조회한다.
- `timetable.get_day_capacity`
  특정 날짜 기준 휴가를 반영한 입력 가능 시간과 입력 가능 여부를 계산한다.

### Write Tools

- `timetable.prepare_day_entry`
  단일 날짜 입력을 준비하고 필수값/시간 제약을 검증한다.
- `timetable.submit_prepared_day_entry`
  준비된 단일 날짜 입력을 제출한다.
- `timetable.prepare_bulk_entries`
  기간 기준 일괄 입력을 준비하고 날짜별 제약을 검증한다.
- `timetable.submit_prepared_bulk_entries`
  준비된 일괄 입력을 제출한다.
- `timetable.clear_day`
  특정 날짜 타임테이블을 비워 삭제한다.

## Validation Strategy

### Before Prepare

- 날짜 형식 검증
- `taskType` 존재 여부 검증
- `workTime > 0` 검증
- `taskType !== NORMAL`이면 `projectId` 존재 여부 검증
- `taskType === NORMAL`이면 `projectId` 없이 진행 가능

### During Prepare

- 휴가 요청 목록을 조회해 대상 날짜 휴가 상태 계산
- 날짜별 최대 입력 가능 시간 계산
- row 합계와 허용 시간 비교
- 연차 종일이면 해당 날짜 prepare 실패

### Before Submit

- prepare 시점과 동일한 검증 재수행
- 제출 payload 최종 구성
- 충돌 시 submit 중단

## Architecture

### Design Principles

1. 타임테이블 비즈니스 규칙은 tool 레이어가 아니라 domain service에 둔다.
2. 휴가 조회와 타임테이블 입력 검증은 같은 서비스 흐름에서 묶어 처리한다.
3. 읽기 도구와 쓰기 도구를 분리한다.
4. 쓰기 도구는 항상 준비 단계 결과를 거친다.

### Layers

```text
User Request
  -> MCP Tool (server.ts)
  -> Timetable Service (domains/timetable/service.ts)
  -> Leave Service or Vacation Query Helper
  -> Portal HTTP Client (core/http-client.ts)
  -> Internal Portal HTTP Requests
  -> Domain Validation Result / Prepared Payload
```

### Proposed Directory Structure

```text
src/
  domains/
    timetable/
      models.ts
      service.ts
  tools/
    timetable-tools.ts
```

## Implementation Phases

### Phase 0. Spec Consolidation

- API spec 기준 타임테이블 endpoint와 request/response shape 정리
- 휴가 타입별 시간 제한 규칙 문서화
- `NORMAL`의 프로젝트 예외 규칙 확정

### Phase 1. Domain Modeling

- 타임테이블 row, day record, project summary 모델 정의
- 휴가 overlay 계산용 모델 정의
- prepared entry 모델 정의

### Phase 2. Read Path

- 프로젝트 목록 조회 구현
- 특정 날짜 상세 조회 구현
- 입력 가능 기간 조회 구현
- 날짜별 입력 가능 시간 계산 구현

### Phase 3. Prepare Flow

- 단일 날짜 prepare 구현
- 일괄 입력 prepare 구현
- 필수값 강제 및 시간 제한 검증 구현

### Phase 4. Submit Flow

- 단일 날짜 submit 구현
- 일괄 입력 submit 구현
- submit 직전 재검증 구현

### Phase 5. Clear Flow

- 특정 날짜 row 전체 삭제 구현
- 삭제 전 사용자 확인 메시지 설계

### Phase 6. Prompt/UX Hardening

- 사용자에게 날짜와 taskType을 빠짐없이 요구하도록 tool 설명 보강
- `NORMAL`이 아닌 경우에만 프로젝트를 요구하도록 tool 설명 보강
- 반차/연차 충돌 시 설명 메시지 정리
- 잘못된 기본값 추론 방지

## Open Questions

- 휴가 조회 시 어떤 상태(`applied`, `approved`)까지 타임테이블 차단 대상으로 볼지 확인 필요
- 반차가 신청중 상태여도 4시간 제한을 적용할지 확인 필요
- 동일 날짜에 여러 프로젝트 row를 허용하되, 각 row에 서로 다른 `taskType`을 허용할지 확인 필요
- `timetable.manage` 및 `timetable.user` 응답을 어떤 UX로 노출할지 확인 필요

## Working Rules

- 타임테이블 write 기능은 휴가 검증 없이 직접 submit 하지 않는다.
- 날짜, task type, 프로젝트 중 하나라도 비어 있으면 prepare 단계에서 실패시킨다.
- `NORMAL`도 MCP 입력값으로 허용한다.
- `NORMAL`이 아닌 입력에는 프로젝트를 반드시 요구한다.
- 구현 진행 시 `WORKLOG.md`와 관련 문서를 함께 갱신한다.
