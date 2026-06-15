# OTP API

**Header (both requests):** `Content-Type: application/json`

**Code:** 6 digits. **Valid for:** 5 minutes after send. After a successful verify, that code cannot be used again.

---

## Send OTP

**URL:** `POST https://<your-host>:3000/api/otp/send`

**Body:**

```json
{
  "phoneNumber": "218923686840"
}
```

*(or use `"identifier"` instead of `"phoneNumber"` — same purpose.)*

**Good response:** `200` — `{ "success": true, "message": "OTP sent successfully" }`

**Bad responses:**

| HTTP | Body |
|------|------|
| `400` | `{ "success": false, "message": "Phone number or Identifier is required" }` — missing both `phoneNumber` and `identifier` |
| `500` | `{ "success": false, "message": "Failed to send OTP", "error": "<details>" }` — server error |

---

## Verify OTP

**URL:** `POST https://<your-host>:3000/api/otp/verify`

**Body:**

```json
{
  "phoneNumber": "218923686840",
  "otpCode": "482915"
}
```

*(Use the same `phoneNumber` / `identifier` value you used in Send.)*

**Good response:** `200` — `{ "success": true, "message": "OTP verified successfully" }`

**Bad responses:**

| HTTP | Body |
|------|------|
| `400` | `{ "success": false, "message": "Phone number/Identifier and OTP code are required" }` — missing identifier or `otpCode` |
| `400` | `{ "success": false, "message": "Invalid or expired OTP" }` — wrong code, expired (after 5 minutes), or already used |
| `500` | `{ "success": false, "message": "Failed to verify OTP", "error": "<details>" }` — server error |
