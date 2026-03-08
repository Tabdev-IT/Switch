const express = require('express');
const router = express.Router();

/**
 * GET /api/sms/status
 * Get SMS service status and connection info
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      libyana: {
        connected: global.SMS_Libyana.isConnected(),
        provider: 'Libyana',
        config: {
          ip: '100.100.100.100',
          port: 5016,
          type: 'trx'
        }
      },
      madar: {
        connected: global.SMS_Madar.isConnected(),
        provider: 'Almadar',
        config: {
          ip: '156.38.62.19',
          port: 7668,
          types: ['tx', 'rx']
        }
      },
      timestamp: new Date().toISOString()
    };
    
    console.log('📱 SMS Status Check:', status);
    
    res.status(200).json({
      success: true,
      message: 'SMS Service Status',
      data: status
    });
    
  } catch (error) {
    console.error('❌ Error getting SMS status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/sms/send
 * Send SMS message
 */
router.post('/send', async (req, res) => {
  try {
    console.log('📱 Received SMS request:', JSON.stringify(req.body, null, 2));
    
    const { to, message, isWelcomeMessage = false } = req.body;
    
    // Validate required fields
    if (!to || !message) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to and message are required'
      });
    }
    
    // Validate phone number format (Libya numbers)
    if (!/^218[0-9]{8}$/.test(to)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid phone number format. Must be a valid Libya number starting with 218'
      });
    }
    
    // Check connection status first
    if (!global.SMS_Libyana.isConnected() && !global.SMS_Madar.isConnected()) {
      return res.status(503).json({
        success: false,
        error: 'SMS service not connected. Please try again later.',
        status: 'not_connected'
      });
    }
    
    // Send SMS
    const result = await global.smsManager.Send({
      to,
      message,
      isWelcomeMessage
    });
    
    console.log('📤 SMS send result:', result);
    
    if (result.success) {
      res.status(200).json({
        success: true,
        message: 'SMS sent successfully',
        data: result
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to send SMS',
        error: result.error,
        data: result
      });
    }
    
  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
});

/**
 * GET /api/sms/test-connection
 * Test SMPP connections
 */
router.get('/test-connection', (req, res) => {
  try {
    console.log('🔌 Testing SMPP connections...');
    
    const connectionTest = {
      libyana: {
        provider: 'Libyana',
        connected: global.SMS_Libyana.isConnected(),
        config: {
          ip: '100.100.100.100',
          port: 5016,
          type: 'trx'
        }
      },
      madar: {
        provider: 'Almadar',
        connected: global.SMS_Madar.isConnected(),
        config: {
          ip: '156.38.62.19',
          port: 7668,
          types: ['tx', 'rx']
        }
      }
    };
    
    console.log('🔌 Connection Test Results:', connectionTest);
    
    res.status(200).json({
      success: true,
      message: 'SMPP Connection Test Results',
      data: connectionTest
    });
    
  } catch (error) {
    console.error('❌ Error testing connections:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

module.exports = router; 