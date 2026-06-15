require('dotenv').config();

module.exports = {
  // Shared secret for HMAC-SHA256 (sender: hash_hmac / Node: createHmac over the exact JSON body string)
  hmacSecret: process.env.WEBHOOK_HMAC_SECRET || '95c1aad0d7f67e3340616fab1efcdfbe1ec4774da10d3965cf5d3e19ceaf31d7',

  // Bearer token for client_message API gateway (no HMAC)
  clientMessageBearerToken: process.env.CLIENT_MESSAGE_BEARER_TOKEN || process.env.WEBHOOK_BEARER_TOKEN || 'your-secure-bearer-token-here',
  
  // Webhook endpoint path
  endpoint: '/webhooks',

  // Client message gateway (Bearer auth only)
  clientMessageEndpoint: '/webhooks/client-message',
  
  // Allowed HMAC webhook types (bank/FI)
  allowedWebhooks: [
    'transaction_status_update',
    'transaction_credit_notice'
  ],
  
  // Status codes mapping
  statusCodes: {
    '04': 'completed',
    '05': 'failed',
    '06': 'pending',
    '07': 'cancelled'
  }
};
