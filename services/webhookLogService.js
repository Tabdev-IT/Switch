const WebhookLog = require('../models/webhookLog');

class WebhookLogService {
  
  /**
   * Log a webhook transaction to MongoDB
   */
  static async logWebhookTransaction(webhookData, smsResult, requestInfo = {}) {
    try {
      console.log('🔍 WebhookLogService.logWebhookTransaction called with:', {
        webhookData,
        smsResult: smsResult ? 'Available' : 'Not available',
        requestInfo
      });
      
      // Check MongoDB connection
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState !== 1) {
        console.error('❌ MongoDB not connected. Ready state:', mongoose.connection.readyState);
        throw new Error('MongoDB not connected');
      }
      
      console.log('✅ MongoDB connection verified, proceeding with logging...');
      
      const { webhook, data } = webhookData;
      
      // Prepare base log data
      const logData = {
        webhook_type: webhook,
        payment_reference: data.payment_reference,
        request_timestamp: new Date(),
        request_ip: requestInfo.ip || null,
        transaction_id: requestInfo.transactionId || null
      };
      
      // Handle different webhook types
      if (webhook === 'transaction_status_update') {
        const { status, status_code, amount } = data;
        logData.status = status;
        logData.status_code = status_code;
        logData.amount = amount || null;
        
        // Add SMS details if available
        if (smsResult) {
          logData.sms_sent = smsResult.success || false;
          logData.sms_message = smsResult.message || null;
          logData.sms_recipient = '0923686840';
          logData.sms_status = smsResult.success ? 'sent' : 'failed';
          logData.sms_error = smsResult.error || null;
        }
      } else if (webhook === 'transaction_credit_notice') {
        const { amount, debtor_account, debtor_bank, creditor_account, creditor_bank, numo_credit_notice } = data;
        
        console.log('🔍 Debug - Credit Notice Data:', {
          amount,
          debtor_account,
          debtor_bank,
          creditor_account,
          creditor_bank,
          numo_credit_notice,
          numo_credit_notice_type: typeof numo_credit_notice,
          numo_credit_notice_keys: numo_credit_notice ? Object.keys(numo_credit_notice) : 'null'
        });
        
        logData.status = 'credit_notice';
        logData.amount = amount || null;
        logData.debtor_account = debtor_account || null;
        logData.debtor_bank = debtor_bank || null;
        logData.creditor_account = creditor_account || null;
        logData.creditor_bank = creditor_bank || null;
        logData.numo_credit_notice = numo_credit_notice || null;
        
        console.log('🔍 Debug - Final logData.numo_credit_notice:', logData.numo_credit_notice);
        
        // Log RRN specifically for better tracking
        if (numo_credit_notice && numo_credit_notice.rnn) {
          logData.notes = `RRN: ${numo_credit_notice.rnn}`;
        }
        
        // SMS details (use actual result if provided)
        if (smsResult) {
          logData.sms_sent = smsResult.success || false;
          logData.sms_message = smsResult.message || null;
          logData.sms_recipient = '0923686840';
          logData.sms_status = smsResult.success ? 'sent' : 'failed';
          logData.sms_error = smsResult.error || null;
        } else {
          logData.sms_sent = false;
          logData.sms_status = 'pending';
        }
      }
      
      console.log('📝 Prepared log data:', logData);
      
      // Create and save the log
      const webhookLog = new WebhookLog(logData);
      console.log('📝 WebhookLog model created, attempting to save...');
      
      const savedLog = await webhookLog.save();
      
      console.log('📝 Webhook transaction logged to MongoDB:', {
        logId: savedLog._id,
        webhookType: savedLog.webhook_type,
        paymentReference: savedLog.payment_reference,
        status: savedLog.status,
        smsSent: logData.sms_sent
      });
      
      return savedLog;
      
    } catch (error) {
      console.error('❌ Failed to log webhook transaction:', error);
      console.error('❌ Error stack:', error.stack);
      throw error;
    }
  }
  
  /**
   * Get webhook logs with filtering and pagination
   */
  static async getWebhookLogs(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      // Build query
      const query = {};
      
      if (filters.status) query.status = filters.status;
      if (filters.payment_reference) query.payment_reference = filters.payment_reference;
      if (filters.sms_status) query.sms_status = filters.sms_status;
      if (filters.date_from) query.processed_at = { $gte: new Date(filters.date_from) };
      if (filters.date_to) query.processed_at = { ...query.processed_at, $lte: new Date(filters.date_to) };
      
      // Execute query with pagination
      const logs = await WebhookLog.find(query)
        .sort({ processed_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean();
      
      // Get total count for pagination
      const total = await WebhookLog.countDocuments(query);
      
      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to get webhook logs:', error);
      throw error;
    }
  }
  
  /**
   * Get webhook statistics
   */
  static async getWebhookStats() {
    try {
      const stats = await WebhookLog.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            smsSent: { $sum: { $cond: ['$sms_sent', 1, 0] } },
            smsFailed: { $sum: { $cond: [{ $eq: ['$sms_status', 'failed'] }, 1, 0] } }
          }
        },
        {
          $project: {
            status: '$_id',
            count: 1,
            smsSent: 1,
            smsFailed: 1
          }
        }
      ]);
      
      // Get total counts
      const totalTransactions = await WebhookLog.countDocuments();
      const totalSMS = await WebhookLog.countDocuments({ sms_sent: true });
      
      return {
        totalTransactions,
        totalSMS,
        byStatus: stats
      };
      
    } catch (error) {
      console.error('❌ Failed to get webhook statistics:', error);
      throw error;
    }
  }
  
  /**
   * Search webhook logs by payment reference
   */
  static async searchByPaymentReference(paymentReference) {
    try {
      const logs = await WebhookLog.find({
        payment_reference: { $regex: paymentReference, $options: 'i' }
      })
      .sort({ processed_at: -1 })
      .lean();
      
      return logs;
      
    } catch (error) {
      console.error('❌ Failed to search webhook logs:', error);
      throw error;
    }
  }
}

module.exports = WebhookLogService;
