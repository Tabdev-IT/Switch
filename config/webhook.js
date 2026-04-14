module.exports = {
  // Shared secret for HMAC-SHA256 (sender: hash_hmac / Node: createHmac over the exact JSON body string)
  hmacSecret: process.env.WEBHOOK_HMAC_SECRET || '95c1aad0d7f67e3340616fab1efcdfbe1ec4774da10d3965cf5d3e19ceaf31d7',
  
  // Webhook endpoint path
  endpoint: '/webhooks',
  
  // Allowed webhook types
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
