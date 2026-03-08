# FX House API Documentation

Welcome to the FX House API. This document provides technical specifications for integrating with our banking services.

## Base URL
`http://IP:3000`

## Authentication
All requests require a **Bearer Token** in the Authorization header. You can obtain a token through your account manager or the auth endpoint.

| Header | Value | Description |
| :--- | :--- | :--- |
| `Authorization` | `Bearer <YOUR_JWT_TOKEN>` | Required for all endpoints. |
| `Content-Type` | `application/json` | Required for POST requests. |

---

## 1. Get All Balances
Retrieve all available account balances associated with your FX House.

### Endpoint
`GET /api/fx/balance`

### Sample Response (Success)
```json
[
  {
    "ACCOUNT_NUMBER": "101010034024011",
    "BALANCE": 15450.75,
    "CCY": "LYD",
    "ACCOUNT_NAME": "FX HOUSE MAIN - TRIPOLI"
  },
  {
    "ACCOUNT_NUMBER": "101010034024012",
    "BALANCE": 2500.00,
    "CCY": "USD",
    "ACCOUNT_NAME": "FX HOUSE - USD SETTLEMENT"
  }
]
```

---

## 2. Get Transaction Statement
Retrieve a paginated list of transactions for a specific currency.

### Endpoint
`GET /api/fx/statement/:currency`

### Path Parameters
- `currency`: (e.g., `lyd`, `usd`, `eur`)

### Query Parameters (Optional)
- `limit`: Number of records (default: 15)
- `offset`: Starting index (default: 0)
- `drcr`: Filter by direction (`D` for Debit, `C` for Credit)
- `fromDate`: `YYYY-MM-DD`
- `toDate`: `YYYY-MM-DD`

### Sample Response
```json
{
  "customer_number": "000034024",
  "account_number": "101010034024011",
  "currency": "LYD",
  "data": [
    {
      "reference": "FTR24057882",
      "direction": "D",
      "amount": 500.0,
      "date": "2026-02-26",
      "time": "14:30:05",
      "description": "Internal Transfer"
    }
  ],
  "meta": {
    "total": 125,
    "current_page": 1,
    "last_page": 9
  }
}
```

---

## 3. Verify Funds (Single)
Verify if a specific customer account has sufficient funds. This is a **privacy-preserving** check that does not expose the actual balance.

### Endpoint
`POST /api/fx/verify-funds`

### Request Body
```json
{
  "account_number": "101010034024015",
  "amount": 5000.00
}
```

### Sample Response
```json
{
  "account_number": "101010034024015",
  "amount_checked": 5000.0,
  "is_sufficient": true,
  "currency": "LYD"
}
```

---

## 4. Verify Funds (Bulk)
Check multiple accounts in a single request.

### Endpoint
`POST /api/fx/verify-funds`

### Request Body
```json
[
  { "account_number": "101010034024011", "amount": 1000.00 },
  { "account_number": "101010034024012", "amount": 200.00 }
]
```

### Sample Response
```json
[
  {
    "account_number": "101010034024011",
    "amount_checked": 1000.0,
    "is_sufficient": true,
    "currency": "LYD"
  },
  {
    "account_number": "101010034024012",
    "amount_checked": 200.0,
    "is_sufficient": false,
    "currency": "USD"
  }
]
```

---

> [!NOTE]
> If an account number is not found, the API will return `is_sufficient: false` and default the `currency` to **LYD**.

## Error Codes

| Code | Message | Description |
| :--- | :--- | :--- |
| `401` | `Unauthorized` | Invalid or expired token. |
| `400` | `Bad Request` | Missing required parameters. |
| `404` | `Not Found` | Resource or account not found. |
| `500` | `Internal Server Error` | Database or system error. |
