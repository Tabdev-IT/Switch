const nodemailer = require('nodemailer');
const log = require('../utils/logger');

function smtpConfig() {
    const host = process.env.SMTP_HOST || 'mail.tab.ly';
    const port = Number(process.env.SMTP_PORT || 465);
    const user = process.env.SMTP_USER || 'ebanking@tab.ly';
    const pass = process.env.SMTP_PASS || 'TabTab@2021';
    const from = process.env.SMTP_FROM || '"مصرف التضامن" <ebanking@tab.ly>';
    const secure = process.env.SMTP_SECURE != null
        ? process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true'
        : port === 465;
    return { host, port, user, pass, from, secure };
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

let transporter;

function mailer() {
    if (transporter) return transporter;
    const smtp = smtpConfig();
    if (!smtp.host || !smtp.user || !smtp.pass) return null;
    transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: { user: smtp.user, pass: smtp.pass },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 30000
    });
    return transporter;
}

/**
 * Send the same OTP code that was just texted. A missing address or a mail
 * failure does not fail the SMS send.
 */
async function sendOtpEmail(email, otpCode) {
    const to = String(email || '').trim();
    if (!isEmail(to)) return false;

    const transport = mailer();
    if (!transport) {
        log('⚠️ SMTP is not configured. OTP email skipped.');
        return false;
    }

    const smtp = smtpConfig();
    try {
        await transport.sendMail({
            from: smtp.from,
            to,
            subject: 'رمز التحقق - مصرف التضامن',
            text: `رمز التحقق الخاص بك هو: ${otpCode}. صالح لمدة 5 دقائق.`
        });
        log(`✉️ OTP email sent to ${to}`);
        return true;
    } catch (err) {
        log(`❌ OTP email failed for ${to}: ${err.message}`);
        return false;
    }
}

module.exports = { sendOtpEmail, isEmail };
