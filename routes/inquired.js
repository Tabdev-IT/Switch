const express = require('express');
const router = express.Router();
const { validateRequestBody } = require('../utils/validation');
const transactionService = require('../services/transactionService');

/**
 * POST /bank-url/api/inquired
 * Inquired transaction lookup endpoint
 */
router.post('/inquired', async (req, res) => {
  try {
    console.log('📥 Received inquired request:', JSON.stringify(req.body, null, 2));
    
    // Validate request body
    const validation = validateRequestBody(req.body);
    if (!validation.isValid) {
      console.log('❌ Validation failed:', validation.error, validation.message);
      return res.status(400).json({
        Result: [{
          Code: validation.error,
          Message: validation.message
        }]
      });
    }
    
    // Extract transaction data from request
    const transactionData = req.body.LookUpData.Details;
    
    console.log('🔍 Looking up transaction with data:', {
      RRN: transactionData.RRN,
      STAN: transactionData.STAN,
      TXNAMT: transactionData.TXNAMT,
      TERMID: transactionData.TERMID,
      SETLDATE: transactionData.SETLDATE,
      'Original Date': transactionData.SETLDATE,
      'Converted Date': transactionData.SETLDATE ? 
        (() => {
          const [day, month, year] = transactionData.SETLDATE.split('-');
          const yearShort = year.slice(-2);
          return `${yearShort}${month.padStart(2, '0')}${day.padStart(2, '0')}`;
        })() : 'N/A'
    });
    
    // Query database for transaction
    const queryResult = await transactionService.lookupTransaction(transactionData);
    
    // Process result and format response
    const response = transactionService.processTransactionResult(queryResult);
    
    console.log('📤 Sending response:', JSON.stringify(response, null, 2));
    
    // Send response
    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Unexpected error in inquired endpoint:', error);
    
    // Send generic error response
    res.status(500).json({
      Result: [{
        Code: 'E9',
        Message: 'Core bank system error'
      }]
    });
  }
});

module.exports = router; 