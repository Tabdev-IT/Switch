const crypto = require('crypto');
const webhookConfig = require('../config/webhook');

/**
 * Canonical JSON string and HMAC-SHA256 hex (same as PHP hash_hmac('sha256', $payloadJson, $secret)).
 * The HTTP body must be exactly `body` — signing any other serialization will fail verification.
 */
function jsonBodyAndHmacHex(payload) {
  const body = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', webhookConfig.hmacSecret).update(body, 'utf8').digest('hex');
  return { body, signature };
}

/**
 * @param {Object} payload - Webhook payload
 * @returns {string} - HMAC hex signature
 */
function generateHMACSignature(payload) {
  const { body, signature } = jsonBodyAndHmacHex(payload);
  console.log('🔐 Generating HMAC for body:', body);
  console.log('🔐 Generated signature:', signature);
  return signature;
}

/**
 * Generate test webhook payload for transaction status update
 * @param {string} status - Transaction status (completed, failed, pending, cancelled)
 * @param {string} statusCode - Status code (04, 05, 06, 07)
 * @param {string} paymentReference - Payment reference number
 * @param {string} amount - Transaction amount
 * @returns {Object} - Test webhook payload
 */
function generateTestPayload(status = 'completed', statusCode = '04', paymentReference = 'REF123456789', amount = '50000') {
  return {
    webhook: 'transaction_status_update',
    data: {
      payment_reference: paymentReference,
      status: status,
      status_code: statusCode,
      amount: {
        amount: amount,
        currency: 'LYD'
      }
    }
  };
}

/**
 * Generate test webhook payload for transaction credit notice
 * @param {string} paymentReference - Payment reference number
 * @param {string} amount - Transaction amount
 * @param {string} debtorName - Debtor account holder name
 * @param {string} debtorAccount - Debtor account number
 * @param {string} creditorAccount - Creditor account number
 * @returns {Object} - Test webhook payload
 */
function generateCreditNoticePayload(paymentReference = 'REF12345-6789-IRKAS-48224222', amount = '50000', debtorName = 'MOHAMMED ALTALEESI', debtorAccount = 'LY5800285100012443402016', creditorAccount = 'IT60X0542811101000000123456') {
  return {
    webhook: 'transaction_credit_notice',
    data: {
      amount: {
        amount: amount,
        currency: 'LYD',
        fees: '2500'
      },
      debtor_account: {
        scheme_name: 'IBAN',
        identification: debtorAccount,
        name: debtorName
      },
      debtor_bank: {
        name: 'Bank of Debtor',
        code: '025'
      },
      creditor_account: {
        scheme_name: 'IBAN',
        identification: creditorAccount
      },
      creditor_bank: {
        name: 'Bank of Creditor',
        code: 'ICICITBB'
      },
      numo_credit_notice: {
        rnn: 'RNN12345'
      },
      payment_reference: paymentReference
    }
  };
}

/**
 * Generate cURL command for testing webhook
 * @param {Object} payload - Webhook payload
 * @param {string} baseUrl - Base URL for the webhook endpoint
 * @returns {string} - cURL command
 */
function generateCurlCommand(payload, baseUrl = 'http://localhost:3000') {
  const { body, signature } = jsonBodyAndHmacHex(payload);
  const shellBody = body.replace(/'/g, `'\\''`);
  return `curl --location '${baseUrl}/webhooks' \\
--header 'Content-Type: application/json' \\
--header 'Signature: ${signature}' \\
--data-raw '${shellBody}'`;
}

/**
 * Show what SMS will be sent for each test case
 */
function showSMSExamples() {
  console.log('📱 SMS Examples for Each Test Case:\n');
  
  // Test 1: Successful transaction (50000 -> 50)
  console.log('✅ Test 1: Amount 50000 -> SMS: "Transaction of amount 50 has been completed"');
  
  // Test 2: Failed transaction (25000 -> 25)
  console.log('❌ Test 2: Amount 25000 -> SMS: "Transaction of amount 25 has been declined"');
  
  // Test 3: Pending transaction (75000 -> 75)
  console.log('⏳ Test 3: Amount 75000 -> SMS: "Transaction of amount 75 status: pending"');
  
  // Test 4: Cancelled transaction (100000 -> 100)
  console.log('🚫 Test 4: Amount 100000 -> SMS: "Transaction of amount 100 status: cancelled"');
  
  // Test 5: Credit Notice (50000 -> 50)
  console.log('💰 Test 5: Amount 50000 -> SMS: "Credit notice for incoming transfer"');
  
  console.log('\n📞 SMS will be sent to: 092368640');
  console.log('---\n');
}

/**
 * Test webhook with different scenarios
 */
function testWebhookScenarios() {
  console.log('🧪 Webhook Test Scenarios\n');
  
  // Test 1: Successful transaction
  const successPayload = generateTestPayload('completed', '04', 'REF123456789', '50000');
  console.log('✅ Test 1: Successful Transaction');
  console.log('Payload:', JSON.stringify(successPayload, null, 2));
  console.log('cURL:', generateCurlCommand(successPayload));
  console.log('---\n');
  
  // Test 2: Failed transaction
  const failedPayload = generateTestPayload('failed', '05', 'REF123456790', '25000');
  console.log('❌ Test 2: Failed Transaction');
  console.log('Payload:', JSON.stringify(failedPayload, null, 2));
  console.log('cURL:', generateCurlCommand(failedPayload));
  console.log('---\n');
  
  // Test 3: Pending transaction
  const pendingPayload = generateTestPayload('pending', '06', 'REF123456791', '75000');
  console.log('⏳ Test 3: Pending Transaction');
  console.log('Payload:', JSON.stringify(pendingPayload, null, 2));
  console.log('cURL:', generateCurlCommand(pendingPayload));
  console.log('---\n');
  
  // Test 4: Cancelled transaction
  const cancelledPayload = generateTestPayload('cancelled', '07', 'REF123456792', '100000');
  console.log('🚫 Test 4: Cancelled Transaction');
  console.log('Payload:', JSON.stringify(cancelledPayload, null, 2));
  console.log('cURL:', generateCurlCommand(cancelledPayload));
  console.log('---\n');
  
  // Test 5: Transaction Credit Notice
  const creditNoticePayload = generateCreditNoticePayload();
  console.log('💰 Test 5: Transaction Credit Notice');
  console.log('Payload:', JSON.stringify(creditNoticePayload, null, 2));
  console.log('cURL:', generateCurlCommand(creditNoticePayload));
  console.log('---\n');
}

/**
 * Generate environment variables for configuration
 */
function generateEnvVars() {
  console.log('🔧 Environment Variables for Webhook Configuration\n');
  console.log('# Webhook Configuration');
  console.log(`WEBHOOK_HMAC_SECRET=${webhookConfig.hmacSecret}`);
  console.log('\n# Add this to your .env file or server environment');
}

// Export functions for use in other files
module.exports = {
  generateTestPayload,
  generateCurlCommand,
  jsonBodyAndHmacHex,
  testWebhookScenarios,
  generateEnvVars,
  showSMSExamples
};

// If this file is run directly, show test scenarios
if (require.main === module) {
  console.log('🚀 Webhook Testing Utility\n');
  console.log('Current Configuration:');
  console.log(`HMAC Secret: ${webhookConfig.hmacSecret}`);
  console.log(`Endpoint: ${webhookConfig.endpoint}\n`);
  
  testWebhookScenarios();
  showSMSExamples();
  generateEnvVars();
}
