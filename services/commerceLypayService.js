const crypto = require('crypto');
const axios = require('axios');
const https = require('https');
const CommerceLypayPayment = require('../models/CommerceLypayPayment');
const Otp = require('../models/Otp');
const smsService = require('./smsService');
const LyPayService = require('./lyPayService');
const oracle = require('../utils/Oracle');
const { FormatContactNumber } = require('../utils/phone');
const log = require('../utils/logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE = new Set(['PROCESSING', 'CONFIRMED']);
const TERMINAL = new Set(['FAILED', 'OTP_RETRIES_EXCEEDED', 'INSUFFICIENT_FUNDS']);

function ourBankCode() {
  const raw = process.env.COMMERCE_LYPAY_BANK_CODE || '015';
  const digits = String(raw).replace(/\D/g, '');
  return digits ? digits.slice(-3).padStart(3, '0') : '015';
}

function otpMaxAttempts() {
  return Number(process.env.COMMERCE_LYPAY_OTP_MAX_ATTEMPTS || 3);
}

function success(data = {}) {
  return { status: { code: 'SUCCESS' }, data };
}

function fail(code, message, extra = {}) {
  return { status: { code, errorInfo: { Message: message, ...extra } } };
}

function normIban(v) {
  return String(v || '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function normBankCode(c) {
  const digits = String(c || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(-3).padStart(3, '0');
}

function bankCodeFromIban(iban) {
  const s = normIban(iban);
  if (s.length < 7 || !s.startsWith('LY')) return '';
  return s.slice(4, 7);
}

function firstNonEmpty(...values) {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return '';
}

function isStrictMilliLydInteger(amount) {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}

function extractCoreAccountFromIban(iban) {
  if (!iban) return null;
  const digits = String(iban).replace(/\D/g, '');
  if (digits.length >= 15) return digits.slice(-15);
  return null;
}

function pickAccountName(row = {}) {
  return firstNonEmpty(row.CUSTOMER_NAME, row.AC_DESC, row.CUSTOMER_1);
}

function pickPhone(row = {}) {
  return firstNonEmpty(row.MOBILE_NUMBER, row.MOBNUM, row.MOB_NUM);
}

function toOtpIdentifier(phone) {
  const local = FormatContactNumber(phone);
  if (!local) return '';
  // Match Switch OTP / SMPP style: 2189XXXXXXXX
  if (local.startsWith('0')) return `218${local.slice(1)}`;
  return local;
}

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function newBankReference() {
  return `BR-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
}

function extractSwitchTransactionId(...sources) {
  for (const data of sources) {
    if (!data || typeof data !== 'object') continue;
    const root = data.data && typeof data.data === 'object' ? data.data : data;
    const candidates = [
      root.switchTransactionId,
      root.numoNotice?.uuid,
      root.numoNotice?.transactionId,
      root.numo?.uuid,
      root.uuid,
      data.uuid
    ];
    for (const c of candidates) {
      const s = String(c || '').trim();
      if (UUID_RE.test(s)) return s;
    }
  }
  return '';
}

function looksLikeInsufficientFunds(message, data) {
  const blob = `${message || ''} ${JSON.stringify(data || {})}`.toLowerCase();
  return /insufficient|not enough|رصيد|funds/.test(blob);
}

async function sendSessionOtp(switchIdentifier) {
  const otpCode = generateOtpCode();
  await Otp.findOneAndUpdate(
    { identifier: switchIdentifier },
    { otpCode, createdAt: Date.now() },
    { upsert: true, new: true }
  );
  const sent = await smsService.sendOtpSms(switchIdentifier, otpCode);
  if (!sent) {
    throw new Error('Failed to send OTP SMS');
  }
}

async function verifySessionOtp(switchIdentifier, otpCode) {
  const otpRecord = await Otp.findOne({ identifier: switchIdentifier, otpCode: String(otpCode).trim() });
  if (!otpRecord) {
    const err = new Error('Invalid or expired OTP');
    err.code = 'OTP_MISMATCH';
    throw err;
  }
  await Otp.deleteOne({ _id: otpRecord._id });
}

async function resolveAliasToIban(alias) {
  const base = (process.env.NAD_BASE_URL || 'https://pronad.mfsi.ly/api/v1').replace(/\/$/, '');
  const token = process.env.NAD_TOKEN || '';
  const insecure = String(process.env.NAD_INSECURE_TLS ?? 'true').toLowerCase() !== 'false';
  const httpsAgent = insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  const res = await axios.get(`${base}/individuals/lookup`, {
    params: { schema: 'alias', id: alias },
    timeout: Number(process.env.NAD_TIMEOUT_MS || 15000),
    httpsAgent,
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    validateStatus: () => true
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`NAD lookup failed (${res.status})`);
  }
  const data = res.data?.data || res.data || {};
  const account = data.account || data;
  return normIban(account.iban || account.identification || data.iban);
}

async function enrichCreditor(creditorIban, creditorBankCode) {
  let name = '';
  let bankName = '';
  let bankCode = normBankCode(creditorBankCode) || bankCodeFromIban(creditorIban);
  try {
    const base = (process.env.NAD_BASE_URL || 'https://pronad.mfsi.ly/api/v1').replace(/\/$/, '');
    const token = process.env.NAD_TOKEN || '';
    const insecure = String(process.env.NAD_INSECURE_TLS ?? 'true').toLowerCase() !== 'false';
    const httpsAgent = insecure ? new https.Agent({ rejectUnauthorized: false }) : undefined;
    const res = await axios.get(`${base}/individuals/lookup`, {
      params: { schema: 'iban', id: creditorIban },
      timeout: Number(process.env.NAD_TIMEOUT_MS || 15000),
      httpsAgent,
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      validateStatus: () => true
    });
    if (res.status >= 200 && res.status < 300) {
      const data = res.data?.data || res.data || {};
      const account = data.account || data;
      const institution = data.institution || account.institution || {};
      name = firstNonEmpty(account.name, data.name, data.fullName);
      bankName = firstNonEmpty(institution.name, data.bankName);
      bankCode = bankCode || normBankCode(institution.code || data.bankCode);
    }
  } catch (e) {
    log(`commerce_lypay NAD creditor enrich skipped: ${e.message}`);
  }
  return {
    name: name || 'Merchant',
    bankName: bankName || 'مصرف',
    bankCode: bankCode || normBankCode(creditorBankCode)
  };
}

async function resolveDebtor(schema, identification) {
  const schemaNorm = String(schema || '')
    .trim()
    .toLowerCase();
  let iban = '';

  if (schemaNorm === 'iban') {
    iban = normIban(identification);
  } else if (schemaNorm === 'alias') {
    const alias = String(identification || '').trim();
    if (!alias) return { error: fail('INVALID_REQUEST', 'debtorAccountIdentification is required for alias') };
    try {
      iban = await resolveAliasToIban(alias);
    } catch (e) {
      log(`commerce_lypay alias resolve failed: ${e.message}`);
      return { error: fail('DEBTOR_NOT_FOUND', 'Could not resolve debtor alias') };
    }
    if (!iban) return { error: fail('DEBTOR_NOT_FOUND', 'Could not resolve debtor alias to an IBAN') };
  } else {
    return { error: fail('INVALID_REQUEST', 'debtorAccountSchema must be iban or alias') };
  }

  if (!iban) return { error: fail('INVALID_REQUEST', 'debtorAccountIdentification is required') };

  let account = await oracle.getCblInfoByIban(iban);
  if (!account) {
    const core = extractCoreAccountFromIban(iban);
    if (core) account = await oracle.getCblInfoByAccount(core);
  }
  if (!account) return { error: fail('DEBTOR_NOT_FOUND', 'Debtor account not found at this bank') };

  const accountNo = String(account.CUST_AC_NO || '').trim();
  const resolvedIban = normIban(account.IBAN_AC_NO) || iban;
  const phone = pickPhone(account);
  const switchIdentifier = toOtpIdentifier(phone);
  if (!switchIdentifier) {
    return { error: fail('DEBTOR_PHONE_MISSING', 'No valid mobile number for debtor OTP') };
  }

  return {
    accountNo,
    iban: resolvedIban,
    name: pickAccountName(account),
    phone: FormatContactNumber(phone) || phone,
    switchIdentifier,
    bankCode: bankCodeFromIban(resolvedIban)
  };
}

async function initiate(body) {
  const paymentReferenceId = String(body?.paymentReferenceId || '').trim();
  if (!UUID_RE.test(paymentReferenceId)) {
    return fail('INVALID_REQUEST', 'paymentReferenceId must be a UUID');
  }
  if (!isStrictMilliLydInteger(body?.amount)) {
    return fail('INVALID_REQUEST', 'amount must be a positive JSON integer (milli-LYD)');
  }
  if (String(body?.currency || '').toUpperCase() !== 'LYD') {
    return fail('INVALID_REQUEST', 'currency must be LYD');
  }

  const debtorBankCode = normBankCode(body?.debtorBankCode);
  const ourBank = ourBankCode();
  if (!debtorBankCode || debtorBankCode !== ourBank) {
    return fail('MISROUTED', `debtorBankCode must be this bank (${ourBank})`);
  }

  if (String(body?.creditorAccountSchema || '').trim().toLowerCase() !== 'iban') {
    return fail('INVALID_REQUEST', 'creditorAccountSchema must be iban');
  }
  const creditorIban = normIban(body?.creditorAccountIdentification);
  if (!creditorIban) {
    return fail('INVALID_REQUEST', 'creditorAccountIdentification is required');
  }

  const existing = await CommerceLypayPayment.findOne({ paymentReferenceId });
  if (existing) {
    if (
      DONE.has(existing.paymentStatus) ||
      existing.paymentStatus === 'AWAITING_OTP' ||
      existing.paymentStatus === 'CONFIRMING'
    ) {
      return success({ bankReference: existing.bankReference });
    }
    if (TERMINAL.has(existing.paymentStatus)) {
      return fail('SESSION_CLOSED', 'Payment session is already closed');
    }
    return success({ bankReference: existing.bankReference });
  }

  const debtor = await resolveDebtor(body?.debtorAccountSchema, body?.debtorAccountIdentification);
  if (debtor.error) return debtor.error;
  if (debtor.bankCode && debtor.bankCode !== ourBank) {
    return fail('MISROUTED', 'Debtor IBAN does not belong to this bank');
  }

  const creditor = await enrichCreditor(creditorIban, body?.creditorBankCode);
  const bankReference = newBankReference();

  try {
    await sendSessionOtp(debtor.switchIdentifier);
  } catch (e) {
    log(`commerce_lypay OTP send failed: ${e.message}`);
    return fail('BANK_ERROR', 'Failed to send OTP');
  }

  try {
    await CommerceLypayPayment.create({
      paymentReferenceId,
      bankReference,
      paymentStatus: 'AWAITING_OTP',
      amount: body.amount,
      currency: 'LYD',
      debtorBankCode,
      debtorAccountSchema: String(body?.debtorAccountSchema || '').toLowerCase(),
      debtorAccountId: String(body?.debtorAccountIdentification || '').trim(),
      debtorIban: debtor.iban,
      debtorAccountNo: debtor.accountNo,
      debtorName: debtor.name,
      creditorBankCode: creditor.bankCode || normBankCode(body?.creditorBankCode),
      creditorAccountSchema: 'iban',
      creditorAccountId: creditorIban,
      creditorName: creditor.name,
      creditorBankName: creditor.bankName,
      phone: debtor.phone,
      switchIdentifier: debtor.switchIdentifier,
      otpAttempts: 0,
      initiateRequest: body
    });
  } catch (err) {
    if (err?.code === 11000) {
      const row = await CommerceLypayPayment.findOne({ paymentReferenceId });
      if (row) return success({ bankReference: row.bankReference });
    }
    throw err;
  }

  return success({ bankReference });
}

async function runGatewayDebit(row) {
  const paymentReferenceId = row.paymentReferenceId;
  const amountLyd = Number(row.amount) / 1000;

  if (row.debtorAccountNo) {
    const bal = await oracle.getWithdrawableBalance(row.debtorAccountNo);
    if (Number.isFinite(bal) && bal < amountLyd) {
      row.paymentStatus = 'INSUFFICIENT_FUNDS';
      row.lastError = 'Insufficient funds';
      await row.save();
      return fail('INSUFFICIENT_FUNDS', 'Insufficient funds');
    }
  }

  const payload = {
    transactionType: 'P2P',
    initiation: {
      amount: { amount: String(row.amount), currency: 'lyd' },
      debtorAccount: {
        schemeName: 'iban',
        identification: row.debtorIban,
        name: row.debtorName || 'Customer'
      },
      creditorAccount: {
        schemeName: 'iban',
        identification: row.creditorAccountId,
        name: row.creditorName || 'Merchant'
      },
      creditorInstitution: {
        name: row.creditorBankName || 'مصرف',
        code: row.creditorBankCode || ''
      },
      description: `LyPay Commerce ${paymentReferenceId}`
    }
  };

  let initiateData;
  try {
    const result = await LyPayService.initiateFundsTransfer(payload);
    initiateData = result.data?.data || result.data || {};
    if (!result.ok) {
      const msg = initiateData?.message || initiateData?.error?.message || `HTTP ${result.status}`;
      if (looksLikeInsufficientFunds(msg, initiateData)) {
        row.paymentStatus = 'INSUFFICIENT_FUNDS';
        row.lastError = 'Insufficient funds';
        row.gatewayInitiateResponse = initiateData;
        await row.save();
        return fail('INSUFFICIENT_FUNDS', 'Insufficient funds');
      }
      row.lastError = msg;
      row.gatewayInitiateResponse = initiateData;
      await row.save();
      return fail('BANK_ERROR', 'Failed to initiate Switch transfer');
    }
  } catch (e) {
    row.lastError = e.message;
    await row.save();
    log(`commerce_lypay gateway initiate error: ${e.message}`);
    return fail('BANK_ERROR', 'Failed to initiate Switch transfer');
  }

  const lypayUuid = firstNonEmpty(initiateData.uuid);
  if (!lypayUuid) {
    row.lastError = 'Gateway initiate missing uuid';
    row.gatewayInitiateResponse = initiateData;
    await row.save();
    return fail('BANK_ERROR', 'Invalid gateway initiate response');
  }

  const paymentReference = firstNonEmpty(initiateData.paymentReference);
  const transactionTimestamp = firstNonEmpty(
    initiateData.transactionTimestamp,
    initiateData.valueDateTime,
    initiateData.transactionDateTime
  );

  row.lypayUuid = lypayUuid;
  row.lypayPaymentReference = paymentReference || null;
  row.lypayTransactionTimestamp = transactionTimestamp || null;
  row.gatewayInitiateResponse = initiateData;
  await row.save();

  let confirmData;
  try {
    const result = await LyPayService.confirmFundsTransfer(lypayUuid, {
      paymentReference,
      transactionTimestamp
    });
    confirmData = result.data?.data || result.data || {};
    if (!result.ok) {
      const msg = confirmData?.message || confirmData?.error?.message || `HTTP ${result.status}`;
      if (looksLikeInsufficientFunds(msg, confirmData)) {
        row.paymentStatus = 'INSUFFICIENT_FUNDS';
        row.lastError = 'Insufficient funds';
        row.gatewayConfirmResponse = confirmData;
        await row.save();
        return fail('INSUFFICIENT_FUNDS', 'Insufficient funds');
      }
      row.lastError = msg;
      row.gatewayConfirmResponse = confirmData;
      await row.save();
      return fail('BANK_ERROR', 'Failed to confirm Switch transfer');
    }
  } catch (e) {
    row.lastError = e.message;
    await row.save();
    log(`commerce_lypay gateway confirm error: ${e.message}`);
    return fail('BANK_ERROR', 'Failed to confirm Switch transfer');
  }

  const switchTransactionId = extractSwitchTransactionId(confirmData, initiateData);
  if (!switchTransactionId) {
    row.lastError = 'Gateway confirm missing switchTransactionId/uuid';
    row.gatewayConfirmResponse = confirmData;
    await row.save();
    log(`commerce_lypay missing Switch UUID for ${paymentReferenceId}`);
    return fail('BANK_ERROR', 'Switch transaction id missing from gateway response');
  }

  row.paymentStatus = 'PROCESSING';
  row.switchTransactionId = switchTransactionId;
  row.gatewayConfirmResponse = confirmData;
  row.lastError = undefined;
  await row.save();

  return success({
    paymentStatus: 'PROCESSING',
    switchTransactionId
  });
}

async function confirm(body) {
  const paymentReferenceId = String(body?.paymentReferenceId || '').trim();
  const otp = String(body?.otp ?? '').trim();
  if (!UUID_RE.test(paymentReferenceId)) {
    return fail('INVALID_REQUEST', 'paymentReferenceId must be a UUID');
  }
  if (!otp) return fail('INVALID_REQUEST', 'otp is required');

  let row = await CommerceLypayPayment.findOne({ paymentReferenceId });
  if (!row) return fail('NOT_FOUND', 'Payment session not found');

  if (row.switchTransactionId && DONE.has(row.paymentStatus)) {
    return success({
      paymentStatus: row.paymentStatus === 'CONFIRMED' ? 'PROCESSING' : row.paymentStatus,
      switchTransactionId: row.switchTransactionId
    });
  }

  if (TERMINAL.has(row.paymentStatus)) {
    if (row.paymentStatus === 'INSUFFICIENT_FUNDS') {
      return fail('INSUFFICIENT_FUNDS', row.lastError || 'Insufficient funds');
    }
    if (row.paymentStatus === 'OTP_RETRIES_EXCEEDED') {
      return fail('OTP_RETRIES_EXCEEDED', 'OTP retry limit exceeded. Session cancelled.');
    }
    return fail('SESSION_CLOSED', row.lastError || 'Payment session is closed');
  }

  // Resume after a failed gateway attempt (OTP already verified).
  if (row.paymentStatus === 'CONFIRMING' && !row.switchTransactionId && row.otpVerifiedAt && row.lastError) {
    return runGatewayDebit(row);
  }

  if (row.paymentStatus === 'CONFIRMING' && !row.switchTransactionId) {
    return fail('CONFIRM_IN_PROGRESS', 'Confirmation already in progress');
  }

  const maxAttempts = otpMaxAttempts();
  if (row.otpAttempts >= maxAttempts) {
    row.paymentStatus = 'OTP_RETRIES_EXCEEDED';
    row.lastError = 'OTP retry limit exceeded';
    await row.save();
    return fail('OTP_RETRIES_EXCEEDED', 'OTP retry limit exceeded. Session cancelled.');
  }

  if (row.paymentStatus !== 'AWAITING_OTP') {
    return fail('INVALID_STATE', `Cannot confirm payment in status ${row.paymentStatus}`);
  }

  try {
    await verifySessionOtp(row.switchIdentifier, otp);
  } catch (err) {
    const nextAttempts = Number(row.otpAttempts || 0) + 1;
    const remaining = Math.max(0, maxAttempts - nextAttempts);
    row.otpAttempts = nextAttempts;
    if (nextAttempts >= maxAttempts) {
      row.paymentStatus = 'OTP_RETRIES_EXCEEDED';
      row.lastError = 'OTP retry limit exceeded';
      await row.save();
      return fail('OTP_RETRIES_EXCEEDED', 'OTP retry limit exceeded. Session cancelled.');
    }
    await row.save();
    return fail('OTP_MISMATCH', `Incorrect OTP. ${remaining} attempts remaining.`, {
      attemptsRemaining: remaining
    });
  }

  // Atomic claim AWAITING_OTP → CONFIRMING
  const claimed = await CommerceLypayPayment.findOneAndUpdate(
    { paymentReferenceId, paymentStatus: 'AWAITING_OTP' },
    { $set: { paymentStatus: 'CONFIRMING', otpVerifiedAt: new Date() } },
    { new: true }
  );

  if (!claimed) {
    row = await CommerceLypayPayment.findOne({ paymentReferenceId });
    if (row?.switchTransactionId) {
      return success({
        paymentStatus: 'PROCESSING',
        switchTransactionId: row.switchTransactionId
      });
    }
    return fail('CONFIRM_IN_PROGRESS', 'Confirmation already in progress');
  }

  return runGatewayDebit(claimed);
}

async function status(body) {
  const paymentReferenceId = String(body?.paymentReferenceId || '').trim();
  if (!UUID_RE.test(paymentReferenceId)) {
    return fail('INVALID_REQUEST', 'paymentReferenceId must be a UUID');
  }

  const row = await CommerceLypayPayment.findOne({ paymentReferenceId });
  if (!row) {
    return success({ paymentStatus: 'NOT_FOUND' });
  }

  let paymentStatus = row.paymentStatus;
  if (row.switchTransactionId && (paymentStatus === 'PROCESSING' || paymentStatus === 'CONFIRMED')) {
    paymentStatus = 'CONFIRMED';
  } else if (
    paymentStatus === 'OTP_RETRIES_EXCEEDED' ||
    paymentStatus === 'INSUFFICIENT_FUNDS' ||
    paymentStatus === 'FAILED'
  ) {
    paymentStatus = 'REJECTED';
  } else if (paymentStatus === 'PROCESSING' && !row.switchTransactionId) {
    paymentStatus = 'CONFIRMING';
  }

  const data = { paymentStatus };
  if (paymentStatus === 'CONFIRMED' && row.switchTransactionId) {
    data.switchTransactionId = row.switchTransactionId;
  }
  return success(data);
}

module.exports = {
  initiate,
  confirm,
  status
};
