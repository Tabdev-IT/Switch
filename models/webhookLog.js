const mongoose = require('mongoose');

const webhookLogSchema = new mongoose.Schema({
  // Unique identifier
  webhook_id: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      return `webhook_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  },
  
  // Webhook data
  webhook_type: {
    type: String,
    required: true,
    enum: ['transaction_status_update', 'transaction_credit_notice']
  },
  
  // Transaction details
  payment_reference: {
    type: String,
    required: true,
    index: true
  },
  
  // Status fields (required for status updates, optional for credit notices)
  status: {
    type: String,
    required: function() {
      return this.webhook_type === 'transaction_status_update';
    },
    enum: ['completed', 'declined', 'failed', 'pending', 'cancelled', 'credit_notice']
  },
  
  status_code: {
    type: String,
    required: function() {
      return this.webhook_type === 'transaction_status_update';
    }
  },
  
  // Amount details (optional for declined transactions)
  amount: {
    amount: {
      type: String,
      required: false
    },
    currency: {
      type: String,
      required: false,
      default: 'LYD'
    },
    fees: {
      type: String,
      required: false
    }
  },
  
  // Account details for credit notices
  debtor_account: {
    scheme_name: String,
    identification: String,
    name: String
  },
  
  debtor_bank: {
    name: String,
    code: String
  },
  
  creditor_account: {
    scheme_name: String,
    identification: String,
    name: String
  },
  
  creditor_bank: {
    name: String,
    code: String
  },
  
  // NUMO credit notice details
  numo_credit_notice: {
    rnn: String
  },
  
  // SMS details
  sms_sent: {
    type: Boolean,
    default: false
  },
  
  sms_message: {
    type: String,
    required: false
  },
  
  sms_recipient: {
    type: String,
    required: false
  },
  
  sms_status: {
    type: String,
    enum: ['pending', 'sent', 'failed', 'skipped'],
    default: 'pending'
  },
  
  sms_error: {
    type: String,
    required: false
  },
  
  // Processing details
  processed_at: {
    type: Date,
    default: Date.now
  },
  
  // Request metadata
  request_timestamp: {
    type: Date,
    required: true
  },
  
  request_ip: {
    type: String,
    required: false
  },
  
  // Additional fields for tracking
  transaction_id: {
    type: String,
    required: false
  },
  
  notes: {
    type: String,
    required: false
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt
  collection: 'webhook' // Use the webhook collection you created
});

// Indexes for better query performance
webhookLogSchema.index({ payment_reference: 1, status: 1 });
webhookLogSchema.index({ processed_at: -1 });
webhookLogSchema.index({ sms_status: 1 });

// Create a compound index for common queries
webhookLogSchema.index({ 
  webhook_type: 1, 
  status: 1, 
  processed_at: -1 
});

const WebhookLog = mongoose.model('WebhookLog', webhookLogSchema);

module.exports = WebhookLog;
