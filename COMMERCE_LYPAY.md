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

OTP SMS uses Switch SMPP — UAT phone **0923686840**.  
UAT skips Oracle/NAD account lookup by default (`COMMERCE_LYPAY_SKIP_ORACLE=true`): request IBANs are passed straight to LyPay.

Override with env: `LYPAY_BASE_URL`, `LYPAY_TOKEN`.

## Risk note

`switchTransactionId` is mapped from gateway confirm/initiate `uuid` / `numoNotice.uuid`. Confirm against a live gateway response before CBL UAT.
