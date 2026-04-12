const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const webhookConfig = require('../config/webhook');
const WebhookLogService = require('../services/webhookLogService');
const LyPayService = require('../services/lyPayService');
const { getConnection, closeConnection } = require('../config/database');

// Raw body parser specifically for this route
const rawBodyParser = express.raw({ type: 'application/json', limit: '10mb' });

// Helper: fetch mobile number by core account number from Oracle
async function fetchMobileNumberByAccount(accountNumber) {
  let connection;
  try {
    connection = await getConnection();
    const sql = `SELECT MOBILE_NUMBER FROM ACBOBPP145.cbl_info WHERE CUST_AC_NO = :acc`;
    const result = await connection.execute(sql, { acc: accountNumber });
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0];
      return row.MOBILE_NUMBER || row.mobile_number || null;
    }
    return null;
  } catch (err) {
    console.error('❌ Oracle query failed (fetch mobile by account):', err.message);
    return null;
  } finally {
    try { await closeConnection(connection); } catch (_) {}
  }
}

// Helper: normalize MSISDN per rules
function normalizeMsisdn(msisdnRaw) {
	if (!msisdnRaw) return null;
	const digits = String(msisdnRaw).replace(/\D/g, '');
	if (digits.startsWith('218')) return digits; // keep country code as-is
	if (digits.startsWith('0')) return digits; // already local format
	if (digits.startsWith('9')) return `0${digits}`; // add leading zero for 9/92...
	if (digits.length === 9) return `0${digits}`; // generic 9-digit local
	return digits; // fallback
}

// Helper: extract core account (last 15 digits) from IBAN
function extractCoreAccountFromIban(iban) {
	if (!iban) return null;
	const digits = String(iban).replace(/\D/g, '');
	if (digits.length >= 15) {
		return digits.slice(-15);
	}
	return null;
}

/** LYD or USD (case-insensitive); unknown codes fall back to LYD only when no code given */
function normalizeCurrency(code) {
  if (code == null || String(code).trim() === '') return 'LYD';
  const c = String(code).trim().toUpperCase();
  if (c === 'LYD' || c === 'USD') return c;
  return 'LYD';
}

/** Ly Pay / webhook amounts: minor units -> major (÷1000), up to 3 decimals */
function formatMajorFromMinorUnits(minorStr) {
  if (minorStr == null) return null;
  const minor = Number(String(minorStr).replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(minor)) return String(minorStr);
  const major = minor / 1000;
  return major.toFixed(3).replace(/\.?0+$/, '');
}

function formatAmountLabelArabic(majorStr, currencyCode) {
  const ccy = normalizeCurrency(currencyCode);
  if (ccy === 'USD') return `المبلغ: ${majorStr} USD`;
  return `المبلغ: ${majorStr} د.ل`;
}

// Middleware to verify Bearer token
const authenticateBearerToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Bearer token is required'
    });
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  if (token !== webhookConfig.bearerToken) {
    return res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Invalid Bearer token'
    });
  }
  
  next();
};

// Middleware to verify HMAC signature
const verifyHMACSignature = (req, res, next) => {
  const signature = req.headers.signature;
  
  if (!signature) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Signature header is required'
    });
  }
  
  try {
    // req.body should now be a Buffer from the raw body parser
    if (!(req.body instanceof Buffer)) {
      console.error('❌ Body is not a Buffer:', typeof req.body, req.body);
      return res.status(500).json({
        success: false,
        error: 'Internal Server Error',
        message: 'Body parsing issue - contact administrator'
      });
    }
    
    const rawBody = req.body.toString();
    
    // Create HMAC hash from raw request body
    const hmac = crypto.createHmac('sha256', webhookConfig.hmacSecret);
    const expectedSignature = hmac.update(rawBody).digest('hex');
    
    console.log('🔐 HMAC Verification:', {
      receivedSignature: signature,
      expectedSignature: expectedSignature,
      bodyLength: rawBody.length,
      bodyPreview: rawBody.substring(0, 100) + '...'
    });
    
    // Compare signatures (use constant-time comparison for security)
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Invalid HMAC signature'
      });
    }
    
    // Parse the body for further processing
    try {
      req.body = JSON.parse(rawBody);
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid JSON body'
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ HMAC verification error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: 'Error verifying signature'
    });
  }
};


// Middleware to validate webhook payload
const validateWebhookPayload = (req, res, next) => {
  const { webhook, data } = req.body;
  
  // Check if webhook type is provided
  if (!webhook) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'webhook field is required'
    });
  }
  
  // Check if webhook type is allowed
  if (!webhookConfig.allowedWebhooks.includes(webhook)) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: `Unsupported webhook type: ${webhook}`
    });
  }
  
  // Check if data is provided
  if (!data) {
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'data field is required'
    });
  }
  
  // Validate transaction_status_update specific fields
  if (webhook === 'transaction_status_update') {
    const { payment_reference, status, status_code, amount } = data;
    
    if (!payment_reference || !status || !status_code) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required fields: payment_reference, status, status_code'
      });
    }
    
    // Amount is only required for completed transactions
    if (status === 'completed') {
      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Amount field is required for completed transactions'
        });
      }
      
      if (!amount.amount || !amount.currency) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Amount must include amount and currency fields'
        });
      }
      
      const ccy = String(amount.currency).trim().toUpperCase();
      if (ccy !== 'LYD' && ccy !== 'USD') {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Only LYD or USD currency is supported'
        });
      }
    }
  }
  
  // Validate transaction_credit_notice specific fields
  if (webhook === 'transaction_credit_notice') {
    const { amount, debtor_account, debtor_bank, creditor_account, creditor_bank, numo_credit_notice, payment_reference } = data;
    
    if (!amount || !debtor_account || !debtor_bank || !creditor_account || !creditor_bank || !numo_credit_notice || !payment_reference) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Missing required fields: amount, debtor_account, debtor_bank, creditor_account, creditor_bank, numo_credit_notice, payment_reference'
      });
    }
    
    // Validate amount structure
    if (!amount.amount || !amount.currency) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Amount must include amount and currency fields'
      });
    }
    
    const ccy = String(amount.currency).trim().toUpperCase();
    if (ccy !== 'LYD' && ccy !== 'USD') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Only LYD or USD currency is supported'
      });
    }
    
    // Validate debtor account
    if (!debtor_account.identification || !debtor_account.name) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Debtor account must include identification and name'
      });
    }
    
    // Validate creditor account
    if (!creditor_account.identification) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Creditor account must include identification'
      });
    }
  }
  
  next();
};

/**
 * POST /webhooks
 * Receive webhook notifications from bank/FI system
 */
router.post('/', 
  authenticateBearerToken,
  rawBodyParser, // Apply raw body parser
  verifyHMACSignature,
  validateWebhookPayload,
  async (req, res) => {
    try {
      const { webhook, data } = req.body;
      
      console.log('📥 Webhook received:', {
        type: webhook,
        timestamp: new Date().toISOString(),
        data: data,
        payment_reference: data.payment_reference,
        status: data.status
      });
      
      // Process webhook based on type
      switch (webhook) {
        case 'transaction_status_update':
          console.log('🔄 Processing transaction_status_update webhook...');
          {
            const result = await processTransactionStatusUpdate(req, res, data);
            console.log('✅ Transaction_status_update webhook processed successfully');
            if (result && result.responded) {
              return; // Response already sent inside processor (e.g., 404)
            }
          }
          break;
          
        case 'transaction_credit_notice':
          console.log('🔄 Processing transaction_credit_notice webhook...');
          {
            const result = await processTransactionCreditNotice(req, res, data);
            console.log('✅ Transaction_credit_notice webhook processed successfully');
            if (result && result.responded) {
              return; // Response already sent inside processor
            }
          }
          break;
          
        default:
          console.log('⚠️ Unknown webhook type:', webhook);
      }
      
      // Return 200 OK (no response body as per specification)
      res.status(200).end();
      
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      res.status(500).end();
    }
  }
);

/**
 * Process transaction status update webhook
 */
async function processTransactionStatusUpdate(req, res, data) {
  const { payment_reference, status, status_code, amount } = data;
  
  console.log('💳 Processing transaction status update:', {
    reference: payment_reference,
    status: status,
    statusCode: status_code,
    amount: amount ? amount.amount : 'N/A',
    currency: amount ? amount.currency : 'N/A'
  });
  
  // Check if we've already processed this payment reference
  try {
    const WebhookLog = require('../models/webhookLog');
    const existingLog = await WebhookLog.findOne({ payment_reference }).sort({ createdAt: -1 });
    
    if (existingLog) {
      console.log('⚠️ Payment reference already processed:', {
        payment_reference,
        previousStatus: existingLog.status,
        previousTimestamp: existingLog.createdAt,
        currentStatus: status
      });
      
      // Return early - don't process duplicate payment references
      console.log('⏭️ Skipping duplicate payment reference processing');
      return;
    }
    
    console.log('✅ New payment reference, proceeding with processing...');
    
  } catch (checkError) {
    console.error('❌ Error checking for duplicate payment reference:', checkError.message);
    // Continue processing if we can't check for duplicates
  }
  
  // If completed or declined, try to fetch debtor account via LY Pay API
  let debtorAccountNumber = null;
  let recipientMsisdn = null;
  let creditorName = null;
  let bankName = null;
  let lyPayRecord = null;
  try {
    if (status === 'completed' || status === 'declined' || status === 'failed') {
      const found = await LyPayService.findDebitedByPaymentReference(payment_reference);
      lyPayRecord = found || null;
      if (found && (found.debtorAccount || found.debtor_account)) {
        const acc = found.debtorAccount || found.debtor_account;
        const rawId = acc.identification || acc.accountNumber || acc.account_number || null;
        // Ly Pay often returns IBAN in identification; Oracle lookup uses core account (last 15 digits)
        debtorAccountNumber = extractCoreAccountFromIban(rawId) || rawId;
        console.log('🏦 Debtor account found:', { rawId, debtorAccountNumber });
        
        // Get creditor details from the API response
        if (found.creditorInstitution) {
          bankName = found.creditorInstitution.name || 'Unknown Bank';
          console.log('🏛️ Bank found:', bankName);
        }
        
        // Get creditor name from creditorAccount.name
        creditorName = found.creditorAccount?.name || found.creditor_account?.name || 'غير محدد';
        console.log('👤 Creditor name found:', creditorName);
        
        // Fetch mobile number from Oracle using the debtor account
        const fetchedMobile = await fetchMobileNumberByAccount(debtorAccountNumber);
        recipientMsisdn = normalizeMsisdn(fetchedMobile);
        console.log('📞 Mobile number resolved from Oracle:', { fetchedMobile, normalized: recipientMsisdn });
      } else if (!found) {
        console.log('⚠️ Payment reference not found in LY Pay debited list:', payment_reference);
        // Reply 404 to client for not found and mark as responded
        res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Payment reference not found'
        });
        return { responded: true };
      } else if (found && !(found.debtorAccount || found.debtor_account)) {
        console.log('⚠️ Ly Pay record found but debtor account missing; continuing without Oracle mobile lookup');
      }
    }
  } catch (lyErr) {
    console.error('❌ LY Pay API lookup failed:', lyErr.message);
    // Continue without debtor account
  }

  const BANK_TAGLINE = 'مصرف التضامن نفتخر بي خدمتكم';

  function formatLibyaDateForSms(isoLike) {
    if (!isoLike) {
      try {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Africa/Tripoli',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        }).format(new Date());
      } catch (_) {
        return new Date().toISOString().split('T')[0];
      }
    }
    const d = new Date(isoLike);
    if (Number.isNaN(d.getTime())) return String(isoLike).slice(0, 10);
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Tripoli',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(d);
    } catch (_) {
      return d.toISOString().split('T')[0];
    }
  }

  function pickTxDateForSms(record) {
    return (
      record?.transactionDateTime ||
      record?.transaction_date_time ||
      record?.valueDateTime ||
      record?.value_date_time ||
      null
    );
  }

  function pickMinorAmountString(record, webhookAmount) {
    const fromWebhook = webhookAmount?.amount;
    if (fromWebhook != null && String(fromWebhook).trim() !== '') return String(fromWebhook);
    const da = record?.debtorAmount || record?.debtor_amount;
    if (da?.amount != null && String(da.amount).trim() !== '') return String(da.amount);
    return null;
  }

  const txDate = formatLibyaDateForSms(pickTxDateForSms(lyPayRecord));
  const minorAmountStr = pickMinorAmountString(lyPayRecord, amount);
  const currencyCode = normalizeCurrency(
    amount?.currency ||
      lyPayRecord?.debtorAmount?.currency ||
      lyPayRecord?.debtor_amount?.currency
  );
  const amountMajorStr = minorAmountStr ? formatMajorFromMinorUnits(minorAmountStr) : null;
  const amountLabel =
    amountMajorStr == null ? null : formatAmountLabelArabic(amountMajorStr, currencyCode);

  // Calculate amount divided by 1000 (if amount exists)
  let amountInThousands = 0;
  if (minorAmountStr) {
    amountInThousands = Math.round(parseInt(minorAmountStr, 10) / 1000);
    console.log('💰 Amount calculation:', {
      original: minorAmountStr,
      dividedBy1000: amountInThousands
    });
  } else {
    console.log('💰 No amount provided for this transaction');
  }
  
  // Send SMS only to the customer's MSISDN (resolved from debtor account via Oracle)
  let smsResult = null;
  
  if (global.smsManager && (global.SMS_Libyana.isConnected() || global.SMS_Madar.isConnected())) {
    try {
      let message = '';
      
      if (status === 'completed') {
        const amtLine =
          amountLabel ||
          (amountInThousands > 0
            ? formatAmountLabelArabic(String(amountInThousands), currencyCode)
            : null);
        message = [
          'تمت عملية لي بي بنجاح.',
          `التاريخ: ${txDate}`,
          amtLine,
          `المستفيد: ${creditorName || 'غير محدد'}`,
          `المصرف المستفيد: ${bankName || 'غير محدد'}`,
          BANK_TAGLINE
        ].filter(Boolean).join('\n');
        console.log('✅ Sending SMS for completed transaction');
      } else if (status === 'declined') {
        const amtLine =
          amountLabel ||
          (amountInThousands > 0
            ? formatAmountLabelArabic(String(amountInThousands), currencyCode)
            : null);
        message = [
          'عذراً، تم رفض عملية لي بي.',
          `التاريخ: ${txDate}`,
          amtLine,
          `المستفيد: ${creditorName || 'غير محدد'}`,
          `المصرف المستفيد: ${bankName || 'غير محدد'}`,
          BANK_TAGLINE
        ].filter(Boolean).join('\n');
        console.log('❌ Sending SMS for declined transaction');
      } else if (status === 'failed' || status_code === '05') {
        const amtLine =
          amountLabel ||
          (amountInThousands > 0
            ? formatAmountLabelArabic(String(amountInThousands), currencyCode)
            : null);
        message = [
          'عذراً، فشلت عملية لي بي.',
          `التاريخ: ${txDate}`,
          amtLine,
          `المستفيد: ${creditorName || 'غير محدد'}`,
          `المصرف المستفيد: ${bankName || 'غير محدد'}`,
          BANK_TAGLINE
        ].filter(Boolean).join('\n');
        console.log('❌ Sending SMS for failed transaction');
      } else {
        // For other statuses (pending, cancelled)
        if (amountInThousands > 0) {
          message = [
            `حالة العملية: ${status}`,
            `التاريخ: ${txDate}`,
            formatAmountLabelArabic(String(amountInThousands), currencyCode),
            debtorAccountNumber ? `الحساب: ${debtorAccountNumber}` : null,
            BANK_TAGLINE
          ].filter(Boolean).join('\n');
        } else {
          message = [
            `حالة العملية: ${status}`,
            `التاريخ: ${txDate}`,
            debtorAccountNumber ? `الحساب: ${debtorAccountNumber}` : null,
            BANK_TAGLINE
          ].filter(Boolean).join('\n');
        }
        console.log(`⏳ Sending SMS for ${status} transaction`);
      }
      
      const toNumber = recipientMsisdn;
      if (!toNumber) {
        console.log('📱 Skipping SMS: no customer MSISDN resolved (debtor account → Oracle)');
        smsResult = {
          success: false,
          skipped: true,
          recipient: null,
          message: null,
          error: 'Customer mobile not resolved'
        };
      } else {
        console.log('📱 SMS recipient (customer):', { toNumber });
        const result = await global.smsManager.Send({
          to: toNumber,
          message: message,
          isWelcomeMessage: false
        });
        
        smsResult = {
          success: result.success,
          recipient: toNumber,
          message: message,
          error: result.error || null
        };
        
        if (result.success) {
          console.log('📱 SMS sent successfully:', { to: toNumber, message });
        } else {
          console.error('❌ SMS failed to send:', result.error);
        }
      }
      
    } catch (smsError) {
      console.error('❌ SMS notification failed:', smsError);
      smsResult = {
        success: false,
        message: null,
        error: smsError.message
      };
    }
  } else {
    console.log('⚠️ SMS service not available - SMPP connections not established');
    smsResult = {
      success: false,
      message: null,
      error: 'SMS service not available'
    };
  }
  
  // Log to MongoDB
  try {
    console.log('📝 Attempting to log webhook transaction to MongoDB...');
    console.log('📝 Log data:', {
      payment_reference,
      status,
      status_code,
      amount: amount || 'N/A',
      smsResult: smsResult ? 'Available' : 'Not available'
    });
    
    await WebhookLogService.logWebhookTransaction(
      { webhook: 'transaction_status_update', data: { payment_reference, status, status_code, amount } },
      smsResult,
      { ip: req.ip, transactionId: payment_reference }
    );
    console.log('📝 Webhook transaction logged to MongoDB successfully');
  } catch (dbError) {
    console.error('❌ Failed to log to MongoDB:', dbError.message);
    console.error('❌ Full error:', dbError);
  }
  
  // Log the update completion
  console.log('✅ Transaction status update processed successfully');
  return { responded: false };
}

/**
 * Process transaction credit notice webhook
 */
async function processTransactionCreditNotice(req, res, data) {
  const { amount, debtor_account, debtor_bank, creditor_account, creditor_bank, numo_credit_notice, payment_reference } = data;
  
  console.log('💳 Processing transaction credit notice:', {
    reference: payment_reference,
    amount: amount ? amount.amount : 'N/A',
    currency: amount ? amount.currency : 'N/A',
    debtorAccount: debtor_account,
    creditorAccount: creditor_account,
    rrn: numo_credit_notice?.rnn || 'N/A'
  });
  
  // Check if we've already processed this payment reference
  try {
    const WebhookLog = require('../models/webhookLog');
    const existingLog = await WebhookLog.findOne({ payment_reference }).sort({ createdAt: -1 });
    
    if (existingLog) {
      console.log('⚠️ Payment reference already processed:', {
        payment_reference,
        previousStatus: existingLog.status,
        previousTimestamp: existingLog.createdAt,
        currentStatus: 'credit_notice'
      });
      
      // Return proper response for duplicate payment reference
      console.log('⏭️ Skipping duplicate payment reference processing');
      res.status(200).json({
        success: true,
        message: 'Payment reference already processed',
        data: {
          payment_reference,
          status: 'skipped',
          reason: 'duplicate_payment_reference',
          previous_processing: existingLog.createdAt
        }
      });
      return { responded: true };
    }
    
    console.log('✅ New payment reference, proceeding with processing...');
    
  } catch (checkError) {
    console.error('❌ Error checking for duplicate payment reference:', checkError.message);
    // Continue processing if we can't check for duplicates
  }
  
  // Extract core account numbers from IBANs for logging
  let debtorAccountNumber = null;
  if (debtor_account.identification && debtor_account.identification.startsWith('LY')) {
    debtorAccountNumber = extractCoreAccountFromIban(debtor_account.identification);
    console.log('🏦 Debtor account (IBAN) found:', debtorAccountNumber);
  } else {
    debtorAccountNumber = debtor_account.identification;
    console.log('🏦 Debtor account (Identification) found:', debtorAccountNumber);
  }

  let creditorAccountNumber = null;
  if (creditor_account.identification && creditor_account.identification.startsWith('LY')) {
    creditorAccountNumber = extractCoreAccountFromIban(creditor_account.identification);
    console.log('🏦 Creditor account (IBAN) found:', creditorAccountNumber);
  } else {
    creditorAccountNumber = creditor_account.identification;
    console.log('🏦 Creditor account (Identification) found:', creditorAccountNumber);
  }
  
  // Send SMS notification about incoming transfer
  let smsResult = null;
  
  // Resolve recipient MSISDN from creditor IBAN (last 15 digits -> Oracle)
  const creditorCoreAccount = extractCoreAccountFromIban(creditor_account?.identification);
  let resolvedMsisdn = null;
  if (creditorCoreAccount) {
    try {
      const fetchedMobile = await fetchMobileNumberByAccount(creditorCoreAccount);
      resolvedMsisdn = normalizeMsisdn(fetchedMobile);
      console.log('📞 Resolved recipient from IBAN:', { iban: creditor_account?.identification, coreAccount: creditorCoreAccount, fetchedMobile, resolvedMsisdn });
    } catch (e) {
      console.error('❌ Failed resolving mobile from IBAN/account:', e.message);
    }
  } else {
    console.log('⚠️ Could not extract core account from creditor IBAN');
  }
  
  if (global.smsManager && (global.SMS_Libyana.isConnected() || global.SMS_Madar.isConnected())) {
    try {
      // Format amount (minor units -> major); currency from payload (LYD or USD)
      const minorStr = amount?.amount != null ? String(amount.amount) : '0';
      const creditCurrency = normalizeCurrency(amount?.currency);
      const majorStr =
        minorStr === '0'
          ? '0'
          : formatMajorFromMinorUnits(minorStr) || '0';

      const currentDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Tripoli',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const BANK_TAGLINE = 'مصرف التضامن نفتخر بي خدمتكم';

      // Create Arabic SMS message
      const message = [
        'تم على حسابك إيداع بنجاح.',
        formatAmountLabelArabic(majorStr, creditCurrency),
        `التاريخ: ${currentDate}`,
        `المرسل: ${debtor_account?.name || 'غير محدد'}`,
        `المصرف المرسل: ${debtor_bank?.name || 'غير محدد'}`,
        BANK_TAGLINE
      ].join('\n');
      
      const toNumber = resolvedMsisdn;
      if (!toNumber) {
        console.log('📱 Skipping credit notice SMS: no customer MSISDN resolved (creditor IBAN → Oracle)');
        smsResult = {
          success: false,
          skipped: true,
          recipient: null,
          message: null,
          error: 'Customer mobile not resolved'
        };
      } else {
        console.log('📱 Sending credit notice SMS (customer):', {
          to: toNumber,
          message: message,
          amount: amount?.amount,
          currency: creditCurrency,
          formattedAmount: majorStr
        });
        
        const result = await global.smsManager.Send({
          to: toNumber,
          message: message,
          isWelcomeMessage: false
        });
        
        smsResult = {
          success: result.success,
          recipient: toNumber,
          message: message,
          error: result.error || null
        };
        
        if (result.success) {
          console.log('📱 Credit notice SMS sent successfully:', { to: toNumber });
        } else {
          console.error('❌ Credit notice SMS failed to send:', result.error);
        }
      }
      
    } catch (smsError) {
      console.error('❌ SMS notification failed:', smsError);
      smsResult = {
        success: false,
        message: null,
        error: smsError.message
      };
    }
  } else {
    console.log('⚠️ SMS service not available - SMPP connections not established');
    smsResult = {
      success: false,
      message: null,
      error: 'SMS service not available'
    };
  }
  
  // Log to MongoDB
  try {
    console.log('📝 Attempting to log webhook transaction to MongoDB...');
    console.log('📝 Log data:', {
      payment_reference,
      status: 'credit_notice',
      amount: amount || 'N/A',
      debtorAccount: debtor_account,
      creditorAccount: creditor_account,
      rrn: numo_credit_notice?.rrn || 'N/A',
      smsResult: smsResult ? 'Available' : 'Not available'
    });
    
    await WebhookLogService.logWebhookTransaction(
      { webhook: 'transaction_credit_notice', data: { payment_reference, amount, debtor_account, debtor_bank, creditor_account, creditor_bank, numo_credit_notice } },
      smsResult, // Include SMS result for logging
      { ip: req.ip, transactionId: payment_reference }
    );
    console.log('📝 Webhook transaction logged to MongoDB successfully');
  } catch (dbError) {
    console.error('❌ Failed to log to MongoDB:', dbError.message);
    console.error('❌ Full error:', dbError);
  }
  
  // Log the credit notice completion
  console.log('✅ Transaction credit notice processed successfully');
  return { responded: false };
}

/**
 * GET /webhooks/status
 * Get webhook service status
 */
router.get('/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Webhook service is running',
    timestamp: new Date().toISOString(),
    supportedWebhooks: webhookConfig.allowedWebhooks,
    endpoint: webhookConfig.endpoint
  });
});

/**
 * GET /webhooks/logs
 * Get webhook transaction logs with filtering and pagination
 */
router.get('/logs', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, payment_reference, sms_status, date_from, date_to } = req.query;
    
    const filters = { status, payment_reference, sms_status, date_from, date_to };
    const result = await WebhookLogService.getWebhookLogs(filters, parseInt(page), parseInt(limit));
    
    res.status(200).json({
      success: true,
      message: 'Webhook logs retrieved successfully',
      data: result
    });
    
  } catch (error) {
    console.error('❌ Error getting webhook logs:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /webhooks/stats
 * Get webhook statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await WebhookLogService.getWebhookStats();
    
    res.status(200).json({
      success: true,
      message: 'Webhook statistics retrieved successfully',
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Error getting webhook stats:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /webhooks/search/:reference
 * Search webhook logs by payment reference
 */
router.get('/search/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const logs = await WebhookLogService.searchByPaymentReference(reference);
    
    res.status(200).json({
      success: true,
      message: 'Webhook logs search completed',
      data: {
        reference,
        logs,
        count: logs.length
      }
    });
    
  } catch (error) {
    console.error('❌ Error searching webhook logs:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

module.exports = router;
