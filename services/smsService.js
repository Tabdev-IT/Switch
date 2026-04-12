const log = require('../utils/logger');

class SmsService {
    /**
     * Sends an OTP SMS to a phone number.
     * For testing, all messages are routed to a hardcoded number.
     * 
     * @param {string} phoneNumber - The intended recipient's phone number.
     * @param {string} otpCode - The OTP code to send.
     */
    async sendOtpSms(phoneNumber, otpCode) {
        // OVERRIDE FOR TESTING
        const testingPhoneNumber = '0923686840';

        log(`[TESTING OVERRIDE] Redirecting SMS intended for ${phoneNumber} to ${testingPhoneNumber}`);

        const message = `Your verification code is: ${otpCode}. It expires in 5 minutes.`;

        try {
            if (global.smsManager) {
                // Formatting to international standard often expected by SMPP (Libya = 218)
                let formatNumber = testingPhoneNumber;
                if (formatNumber.startsWith('09')) {
                    formatNumber = '218' + formatNumber.substring(1);
                }

                log(`Attempting to send OTP SMS via SMPP to ${formatNumber}`);

                const result = await global.smsManager.Send({
                    to: formatNumber,
                    message: message,
                    isWelcomeMessage: false
                });

                if (result.success) {
                    log(`📱 SMPP SMS Sent successfully to ${formatNumber}`);
                    return true;
                } else {
                    log(`❌ SMPP failed to send SMS: ${result.error || JSON.stringify(result)}`);
                    return false;
                }
            } else {
                log(`⚠️ global.smsManager is not initialized! Cannot send SMS physically. Please check server.js`);
                return false;
            }
        } catch (err) {
            log(`❌ Error in sendOtpSms: ${err.message}`);
            return false;
        }
    }
}
module.exports = new SmsService();
