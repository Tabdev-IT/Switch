const nodemailer = require('nodemailer');
const log = require('../utils/logger');

function smtpConfig() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const port = Number(process.env.SMTP_PORT);
    const user = String(process.env.SMTP_USER || '').trim();
    const pass = String(process.env.SMTP_PASS || '');
    const from = String(process.env.SMTP_FROM || '').trim();
    const secure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true';
    return { host, port, user, pass, from, secure };
}

function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

let transporter;

function mailer() {
    if (transporter) return transporter;
    const smtp = smtpConfig();
    if (!smtp.host || !smtp.user || !smtp.pass || !smtp.from || !Number.isFinite(smtp.port)) return null;
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

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Same card as the LyPay receipt email: Tadhamun blue, RTL, one clear value. */
function buildOtpEmailHtml(otpCode) {
    const code = escapeHtml(otpCode);
    return `<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:640px;margin:auto;padding:24px;color:#333">
    <div style="border-bottom:2px solid #00aeef;padding-bottom:12px;margin-bottom:20px">
      <h2 style="color:#00aeef;margin:0">رمز التحقق</h2>
    </div>
    <p>عزيزي العميل،</p>
    <p style="margin-top:8px">استخدم الرمز التالي لإتمام العملية في تطبيق مصرف التضامن.</p>
    <table style="width:100%;border-collapse:collapse;margin-top:18px">
      <tr style="background:#f4f4f4">
        <td style="padding:16px 12px;border:1px solid #ddd;font-weight:bold;border-right:3px solid #00aeef;width:38%">رمز التحقق</td>
        <td style="padding:16px 12px;border:1px solid #ddd;font-family:monospace;font-size:28px;font-weight:bold;letter-spacing:6px;color:#111;text-align:center">${code}</td>
      </tr>
      <tr>
        <td style="padding:9px 12px;border:1px solid #ddd;font-weight:bold;border-right:3px solid #00aeef">الصلاحية</td>
        <td style="padding:9px 12px;border:1px solid #ddd">5 دقائق</td>
      </tr>
    </table>
    <p style="margin-top:16px">إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.</p>
    <p style="margin-top:20px;font-size:11px;color:#aaa;text-align:center">مصرف التضامن &mdash; نفتخر بخدمتكم</p>
  </div>`;
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

    const code = String(otpCode ?? '').trim();
    const smtp = smtpConfig();
    try {
        await transport.sendMail({
            from: smtp.from,
            to,
            subject: 'رمز التحقق - مصرف التضامن',
            text: `رمز التحقق الخاص بك هو: ${code}. صالح لمدة 5 دقائق. إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة.`,
            html: buildOtpEmailHtml(code)
        });
        log(`✉️ OTP email sent to ${to}`);
        return true;
    } catch (err) {
        log(`❌ OTP email failed for ${to}: ${err.message}`);
        return false;
    }
}

module.exports = { sendOtpEmail, isEmail };
