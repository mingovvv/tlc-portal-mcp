# 연차관리 API Spec

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

## 2. 사용 휴가 목록 조회

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

## 공통 응답 구조

| 필드 | 타입 | 설명 |
|------|------|------|
| `status` | string | 응답 상태 (`OK`, `UNAUTHORIZED` 등) |
| `statusCode` | integer | HTTP 상태 코드 |
| `data` | object | 응답 데이터 |
