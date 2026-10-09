# LyPay Commerce Bank API (Switch)

Mounted on this Switch service (CBL-connected OTP + LyPay gateway + Oracle).

## Base URL

`http://<switch-host>:3000/commerce/lypay`

| Path | Role |
| --- | --- |
| `POST /initiate` | Open session + SMS OTP |
| `POST /confirm` | Verify OTP → LyPay funds-transfer → `switchTransactionId` |
| `POST /status` | Bank-side session status |

Auth: `Authorization: <COMMERCE_LYPAY_TOKEN>`  
(raw token only — same style as client_message webhooks. `Bearer ` prefix still works if sent.)

## Env

```
COMMERCE_LYPAY_TOKEN=...
COMMERCE_LYPAY_BANK_CODE=015
COMMERCE_LYPAY_OTP_MAX_ATTEMPTS=3
```

(`COMMERCE_LYPAY_BEARER_TOKEN` is also accepted as a fallback env name.)

`debtorBankCode` on initiate must match `COMMERCE_LYPAY_BANK_CODE` (Tadhamun = `015`).

## Smoke (Postman)

1. Import *LyPay Commerce — CBL Bank Integration (v1.0-draft)* collection  
2. `base_url` = `http://localhost:3000/commerce/lypay`  
3. Auth type **No Auth** — add header `Authorization` = your token **without** the word Bearer  
4. initiate → confirm wrong OTP → confirm good OTP → status  
5. Double confirm → same `switchTransactionId`

Amounts are **integer milli-LYD** (`95000` = 95.000 LYD). Business declines stay **HTTP 200**.

Initiate body **requires `creditorName`** (from [Commerce docs](https://documenter.getpostman.com/view/51226357/2sBY4PQLuh)) — we pass it to LyPay. NAD is only a fallback if bank name/code still need enriching.

Example initiate body:

```json
{
  "paymentReferenceId": "3f2a1b6c-7d8e-4f90-a1b2-c3d4e5f60718",
  "messageTime": "2026-07-21T14:00:00.000",
  "amount": 1000,
  "currency": "LYD",
  "debtorBankCode": "015",
  "debtorAccountSchema": "iban",
  "debtorAccountIdentification": "LY56015104104010000813022",
  "creditorBankCode": "015",
  "creditorAccountSchema": "iban",
  "creditorAccountIdentification": "LY98015104104190000574025",
  "creditorName": "Merchant Name"
}
```

OTP SMS uses Switch SMPP — Commerce initiate only, not the Tab OTP list.  
Handsets: **0923686840** (session phone), **0926556724**, **0910473527**, **0925610110**, and **0929000600**.  
UAT skips Oracle debtor lookup by default (`COMMERCE_LYPAY_SKIP_ORACLE=true`).
Override extras with `COMMERCE_LYPAY_OTP_EXTRA_PHONES=0926556724,0910473527,0925610110,0929000600`.

Override with env: `LYPAY_BASE_URL`, `LYPAY_TOKEN`, `NAD_BASE_URL`, `NAD_TOKEN`.

## Status (live LyPay)

`POST /status` now polls LyPay (`GET /funds-transfers/{uuid}` + debited-list fallback):

| LyPay status | We return |
| --- | --- |
| `completed` | `CONFIRMED` |
| `declined` / `failed` | `REJECTED` |
| `processing` / other | `PROCESSING` |
