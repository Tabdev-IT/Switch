module.exports = {
  // Bearer token for webhook authentication
  bearerToken: process.env.WEBHOOK_BEARER_TOKEN || '5f1ca074d43e7298d4aa10e355d165486b7d5f2186a0281abebebafa1d5d2e0c',
  
  // HMAC secret for signature verification
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
