const log = require('../utils/logger');

/** UAT handset that always receives OTP, plus extra testers. */
const TESTING_PHONE = '0923686840';
const EXTRA_OTP_PHONES = ['0910707426', '0913779594', '0922759539', '0922160066'];

function toSmppNumber(phoneNumber) {
    let formatNumber = String(phoneNumber || '').trim();
    if (formatNumber.startsWith('09')) {
        formatNumber = '218' + formatNumber.substring(1);
    } else if (formatNumber.startsWith('9') && formatNumber.length === 10) {
        formatNumber = '218' + formatNumber;
    }
    return formatNumber;
}

class SmsService {
    /**
     * Sends an OTP SMS to a phone number.
     * For testing, messages are copied to the UAT handset and the extra tester numbers.
     * Commerce can pass deliverTo to hit one specific handset.
     *
     * @param {string} phoneNumber - The intended recipient's phone number.
     * @param {string} otpCode - The OTP code to send.
     */
    async sendOtpSms(phoneNumber, otpCode, options = {}) {
        const message = `Your verification code is: ${otpCode}. It expires in 5 minutes.`;
        const recipients = options.deliverTo
            ? [String(options.deliverTo).trim()]
            : [TESTING_PHONE, ...EXTRA_OTP_PHONES];

        log(`[TESTING OVERRIDE] OTP for ${phoneNumber} → ${recipients.join(', ')}`);

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
