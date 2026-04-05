# 포탈 API Spec

Base URL: `https://portal.twolinecloud.com`

## 인증

모든 API 요청에 JWT 토큰을 헤더로 포함해야 합니다.

```
Authorization: <token>
```

> `Bearer` 접두어 없이 토큰 값만 전달합니다.

---

## 1. 연차 현황 조회

### `GET /api/vacation-svc/manage/{employeeId}`

직원의 연차 현황 (총 연차, 사용, 잔여) 정보를 조회합니다.

**Path Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `employeeId` | integer | Y | 직원 ID |

**Request Example**

```
GET /api/vacation-svc/manage/112
Authorization: <token>
```

**Response Example**

```json
{
  "status": "OK",
  "statusCode": 200,
  "data": {
    "result": {
      "vacationManageId": 1249,
      "employee": {
        "employeeId": 112,
        "nameKr": "장민규"
      },
      "allYear": 16.0,
      "useYear": 3.0,
      "useAdmit": 0.0,
      "useSum": 3.0,
      "residualYear": 12.0,
      "residualAdmit": 0.0,
      "residualSum": 12.0,
      "insertYear": 2026
    }
  }
}
```

---

## 2. 사용 연차 목록 조회

### `GET /api/vacation-svc/request/secure`

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `employeeId.employeeId` | integer | Y | 직원 ID |
| `stat` | string | N | 상태 필터. 쉼표로 복수 지정 가능 |
| `sort` | string | N | 정렬 기준 필드 |
| `order` | string | N | 정렬 방향 (`ASC`, `DESC`) |
| `from` | string | N | 날짜 범위 시작 (`yyyy-MM-dd`) |
| `to` | string | N | 날짜 범위 끝 (`yyyy-MM-dd`) |
| `limit` | integer | N | 페이지당 항목 수 |
| `offset` | integer | N | 페이지 오프셋 |

**Response Example**

```json
{
  "status": "OK",
  "statusCode": 200,
  "data": {
    "total": 59,
    "list": [
      {
        "vacationRequestId": 6266,
        "employeeDtoList": {
          "employeeId": 112,
          "nameKr": "장민규"
        },
        "requestDt": "2026-03-27",
        "vacationType": "allDay",
        "period": 1,
        "startDt": "2026-03-27",
        "endDt": "2026-03-27",
        "vacationReason": "개인사유",
        "stat": "applied",
        "rejectReason": null,
        "expirationYn": "N",
        "updateStat": "empty"
      }
    ]
  }
}
```

**`stat` 값 설명**

| 값 | 설명 |
|----|------|
| `applied` | 신청됨 (승인 대기) |
| `approved` | 승인됨 |
| `reject` | 반려됨 |
| `cancel` | 취소됨 |

> **타임테이블 월별 뷰와의 관계**:
> - 타임테이블 월별 캘린더(`/timetable/overview`) 로드 시 이 API(`sort=requestDt&employeeId.employeeId={id}`)를 호출하여 휴가 데이터를 캘린더에 overlay 표시합니다.
> - 캘린더 레이블은 `vacationType` + `stat` 조합으로 생성됩니다. 예: `vacationType: "allDay"` + `stat: "applied"` → **"종일(인정)휴가"**
> - 휴가일의 `GET /api/attendance-svc/timetable/{date}` 응답은 `list: []` (빈 배열)을 반환합니다. 타임테이블 API 자체에는 휴가 정보가 포함되지 않습니다.

---

## 3. 휴가 신청

### `POST /api/vacation-svc/request`

**vacationType / period 규칙**

| UI 표시 | `vacationType` | `period` |
|---------|---------------|---------|
| 종일휴가 | `allDay` | `1` |
| 오전반차 | `AM` | `0.5` |
| 오후반차 | `PM` | `0.5` |
| 인정휴가 | `admit` | `1` |
| 인정오전반차 | `admitAm` | `0.5` |
| 인정오후반차 | `admitPm` | `0.5` |

---

## 4. 휴가 취소

### `DELETE /api/vacation-svc/request/{vacationRequestId}`

---

## 5. 타임테이블 관리 정보 조회

### `GET /api/attendance-svc/timetable/manage`

현재 월의 타임테이블 입력 가능 기간 및 마감 기간 정보를 조회합니다.

**Request Example**

```
GET /api/attendance-svc/timetable/manage
Authorization: <token>
```

---

## 6. 타임테이블 사용자 데이터 조회

### `GET /api/attendance-svc/timetable/user`

현재 로그인한 사용자의 타임테이블 입력 현황을 조회합니다.

**Request Example**

```
GET /api/attendance-svc/timetable/user
Authorization: <token>
```

---

## 7. 타임테이블 입력 가능 기간 조회

### `GET /api/attendance-svc/timetable/manage/available`

타임테이블 입력이 가능한 기간 정보를 조회합니다.

**Request Example**

```
GET /api/attendance-svc/timetable/manage/available
Authorization: <token>
```

---

## 8. 타임테이블 일괄 등록 (기간 저장)

### `POST /api/attendance-svc/timetable/list`

여러 날짜의 타임테이블을 한 번에 등록합니다. 수정 모드에서 기간을 선택하고 적용 후 저장 시 호출됩니다.

**taskType / 업무유형 규칙**

| UI 표시 | `taskType` |
|---------|-----------|
| 프로젝트 수행 | `EXECUTE` |
| 하자보수 | `AFTER_SVC` |
| 연구개발(R&D) | `RESEARCH` |
| 제안서 작업 | `SUGGEST` |
| 기타(일반업무) | `NORMAL` |

**Request Body**

```json
[
  {
    "workDate": "2026-04-01",
    "timetableRows": [
      {
        "workDate": "2026-04-01",
        "projectId": 274,
        "taskType": "EXECUTE",
        "workTime": 8,
        "note": "비고 내용"
      }
    ]
  },
  {
    "workDate": "2026-04-02",
    "timetableRows": [
      {
        "workDate": "2026-04-02",
        "projectId": 274,
        "taskType": "EXECUTE",
        "workTime": 8,
        "note": "비고 내용"
      }
    ]
  }
]
```

> - 배열의 각 요소는 하루치 근무 기록입니다.
> - `timetableRows`에 여러 항목을 넣어 하루에 복수 프로젝트를 입력할 수 있습니다.
> - `projectId`는 `GET /api/project-svc/project/summary?limit=999999` 응답의 `value` 필드입니다.

---

## 9. 타임테이블 단일 날짜 수정/삭제

### `POST /api/attendance-svc/timetable`

특정 날짜의 타임테이블을 수정하거나 삭제합니다. "일별 근무 기록" 탭의 수정/등록 버튼에서 호출됩니다.

> 배치 등록(`POST /api/attendance-svc/timetable/list`)과 달리, `timetableRows` 내 각 항목에 `workDate`를 포함하지 않습니다.

**수정 Request Body (단일 프로젝트)**

```json
{
  "workDate": "2026-04-01",
  "timetableRows": [
    {
      "projectId": 274,
      "taskType": "EXECUTE",
      "workTime": 8,
      "note": "수정된 비고"
    }
  ]
}
```

**수정 Request Body (복수 프로젝트 — 하루에 여러 프로젝트 입력 시)**

```json
{
  "workDate": "2026-04-02",
  "timetableRows": [
    {
      "projectId": 274,
      "taskType": "EXECUTE",
      "workTime": 3,
      "note": "프로젝트 A 비고"
    },
    {
      "projectId": 275,
      "taskType": "EXECUTE",
      "workTime": 5
    }
  ]
}
```

**삭제 Request Body**

```json
{
  "workDate": "2026-04-01",
  "timetableRows": []
}
```

> - `timetableRows`를 빈 배열로 전송하면 해당 날짜의 근무 기록이 전부 삭제됩니다.
> - `note`가 없으면 해당 필드를 생략합니다.
> - 총 근무시간은 8시간을 초과할 수 없습니다.

---

## 10. 타임테이블 단일 날짜 조회

### `GET /api/attendance-svc/timetable/{date}`

특정 날짜의 타임테이블 상세 데이터를 조회합니다. "일별 근무 기록" 탭에서 날짜 선택 시 호출됩니다.

**Path Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `date` | string | Y | 조회할 날짜 (`yyyy-MM-dd`) |

**Request Example**

```
GET /api/attendance-svc/timetable/2026-04-02
Authorization: <token>
```

**Response Example**

```json
{
  "status": "OK",
  "statusCode": 200,
  "data": {
    "list": [
      {
        "workDate": "2026-04-02",
        "projectId": 274,
        "projectName": "SK가스_26년_MI플랫폼 구축(LNG)",
        "taskType": "EXECUTE",
        "workTime": 3,
        "note": "테스트"
      },
      {
        "workDate": "2026-04-02",
        "projectId": 274,
        "projectName": "SK가스_26년_MI플랫폼 구축(LNG)",
        "taskType": "EXECUTE",
        "workTime": 5,
        "note": null
      }
    ]
  }
}
```

---

## 11. 프로젝트 목록 조회

### `GET /api/project-svc/project/summary`

타임테이블 등록 시 프로젝트 선택에 사용되는 프로젝트 목록을 조회합니다.

**Query Parameters**

| 파라미터 | 타입 | 필수 | 설명 |
|---------|------|------|------|
| `limit` | integer | N | 조회 수 (전체 조회 시 `999999`) |

**Request Example**

```
GET /api/project-svc/project/summary?limit=999999
Authorization: <token>
```

**Response Example**

```json
{
  "status": "OK",
  "statusCode": 200,
  "data": {
    "result": [
      {
        "index": 273,
        "label": "SK가스_26년_MI플랫폼 구축(LNG)",
        "value": 274,
        "projectCode": "2604001-03",
        "projectStatus": "IN_PROGRESS",
        "projectType": "STANDARD"
      }
    ]
  }
}
```

**Response Fields**

| 필드 | 타입 | 설명 |
|------|------|------|
| `index` | integer | 목록 내 순서 인덱스 |
| `label` | string | 프로젝트명 (UI 표시용) |
| `value` | integer | 프로젝트 ID — 타임테이블 등록 시 `projectId`로 사용 |
| `projectCode` | string | 프로젝트 코드 |
| `projectStatus` | string | 프로젝트 상태 (`IN_PROGRESS` 등) |
| `projectType` | string | 프로젝트 유형 (`STANDARD` 등) |

---

## 공통 응답 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | string | 응답 상태 (`OK`, `UNAUTHORIZED` 등) |
| `statusCode` | integer | HTTP 상태 코드 |
| `data` | object | 응답 데이터 |
