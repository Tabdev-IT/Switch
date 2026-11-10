const log = require('../utils/logger');

/** Optional emergency override — set OTP_SMS_OVERRIDE_PHONE to force all app OTP to one handset. */
const OVERRIDE_PHONE = String(process.env.OTP_SMS_OVERRIDE_PHONE || '').trim();
const EXTRA_OTP_PHONES = String(process.env.OTP_SMS_EXTRA_PHONES || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

function toSmppNumber(phoneNumber) {
    let formatNumber = String(phoneNumber || '').trim();
    if (formatNumber.startsWith('09')) {
        formatNumber = '218' + formatNumber.substring(1);
    } else if (formatNumber.startsWith('9') && formatNumber.length === 10) {
        formatNumber = '218' + formatNumber;
    }
    return formatNumber;
}

function toLocalPhone(phoneNumber) {
    const digits = String(phoneNumber || '').replace(/\D/g, '');
    if (digits.startsWith('218') && digits.length === 12) return `0${digits.slice(3)}`;
    if (digits.startsWith('09') && digits.length === 10) return digits;
    if (digits.startsWith('9') && digits.length === 9) return `0${digits}`;
    return String(phoneNumber || '').trim();
}

class SmsService {
    /**
     * Sends an OTP SMS to a phone number.
     * Default: SMS goes to the requested phoneNumber.
     * LyPay ecommerce can pass deliverTo to pin a specific handset.
     * Set OTP_SMS_OVERRIDE_PHONE to force delivery to one test handset.
     *
     * @param {string} phoneNumber - The intended recipient's phone number.
     * @param {string} otpCode - The OTP code to send.
     */
    async sendOtpSms(phoneNumber, otpCode, options = {}) {
        // Default Tab app OTP SMS: Arabic + English (app itself is Arabic-only for now).
        // LyPay ecommerce can pass its own `message` + `deliverTo`.
        const message =
            options.message ||
            `رمز التحقق الخاص بك من مصرف التضامن هو: ${otpCode}\nYour Tadhamun Bank verification code is ${otpCode}`;
        const intended = toLocalPhone(phoneNumber);
        // deliverTo (ecommerce) always wins — OVERRIDE_PHONE only affects default app OTP path.
        const recipients = options.deliverTo
            ? [String(options.deliverTo).trim()]
            : OVERRIDE_PHONE
                ? [OVERRIDE_PHONE, ...EXTRA_OTP_PHONES]
                : [intended, ...EXTRA_OTP_PHONES].filter(Boolean);

        if (OVERRIDE_PHONE) {
            log(`[OTP OVERRIDE] OTP for ${phoneNumber} → ${recipients.join(', ')}`);
        } else {
            log(`OTP SMS for ${phoneNumber} → ${recipients.join(', ')}`);
        }

        if (!global.smsManager) {
            log(`⚠️ global.smsManager is not initialized! Cannot send SMS physically. Please check server.js`);
            return false;
        }

        let primaryOk = false;
        let timedOut = false;
        for (let i = 0; i < recipients.length; i++) {
            const local = recipients[i];
            const formatNumber = toSmppNumber(local);
            try {
                log(`Attempting to send OTP SMS via SMPP to ${formatNumber}`);
                const result = await global.smsManager.Send({
                    to: formatNumber,
                    message: message,
                    isWelcomeMessage: false
                });
                if (result.success) {
                    log(`📱 SMPP SMS Sent successfully to ${formatNumber}`);
                    if (i === 0) primaryOk = true;
                } else if (result.error === 'timeout') {
                    // Submit went out; Libyana's ack was late. The handset often still gets the SMS.
                    timedOut = true;
                    log(`⏱️ SMPP ack timed out for ${formatNumber}; SMS may already be delivered`);
                } else {
                    log(`❌ SMPP failed to send SMS to ${formatNumber}: ${result.error || JSON.stringify(result)}`);
                }
            } catch (err) {
                log(`❌ Error in sendOtpSms to ${formatNumber}: ${err.message}`);
            }
        }
        return { ok: primaryOk, timedOut };
    }
}
module.exports = new SmsService();
