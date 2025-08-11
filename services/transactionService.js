const { getConnection, closeConnection } = require('../config/database');

/**
 * Transaction Service for handling Oracle database operations
 */
class TransactionService {
  
  /**
   * Look up transaction in Oracle database
   * @param {Object} transactionData - Transaction lookup data
   * @returns {Promise<Object>} - Query result
   */
  async lookupTransaction(transactionData) {
    const { RRN, STAN, TXNAMT, TERMID, SETLDATE } = transactionData;
    
    // Convert date from DD-MM-YYYY to DDMMYY format
    const convertedDate = this.convertDateForDatabase(SETLDATE);
    
    // Format STAN to 6 digits: left-pad with zeros
    const formattedSTAN = String(STAN).padStart(6, '0');

    // Format TXNAMT to 12 digits: remove leading zeros, append three zeros, left-pad with zeros
    let formattedAmount = String(TXNAMT).replace(/^0+/, '');
    formattedAmount += '000';
    formattedAmount = formattedAmount.padStart(12, '0');
    
    console.log('💰 Amount formatting:', {
      original: TXNAMT,
      afterRemoveLeadingZeros: String(TXNAMT).replace(/^0+/, ''),
      afterAddingThreeZeros: String(TXNAMT).replace(/^0+/, '') + '000',
      final: formattedAmount
    });
    console.log('🔢 STAN formatting:', { original: STAN, final: formattedSTAN });

    const query = `
      SELECT 
        RRN, STAN, TXN_AMT, TERM_ID, SETL_DATE, MSG_TYPE, FROM_ACC, TO_ACC, WORK_PROGRESS
      FROM flxcubp.SWTB_TXN_LOG
      WHERE 
        RRN = :1 AND 
        STAN = :2 AND 
        TXN_AMT = :3 AND 
        TERM_ID = :4 AND 
        SETL_DATE =:5
    `;
    
    const bindParams = [RRN, formattedSTAN, formattedAmount, TERMID, convertedDate];
    
    let connection;
    try {
      connection = await getConnection();
      const result = await connection.execute(query, bindParams);
      
      return {
        success: true,
        data: result.rows,
        rowCount: result.rows.length
      };
      
    } catch (error) {
      console.error('❌ Database query error:', error);
      
      // Handle specific Oracle errors
      if (error.message && error.message.includes('ORA-12543')) {
        return {
          success: false,
          error: 'E8',
          message: 'ORA-12543: TNS:destination host unreachable\n'
        };
      }
      
      return {
        success: false,
        error: 'E9',
        message: 'Core bank system error'
      };
      
    } finally {
      if (connection) {
        await closeConnection(connection);
      }
    }
  }
  
  /**
   * Process transaction lookup result and return appropriate response
   * @param {Object} queryResult - Database query result
   * @returns {Object} - Formatted response
   */
  processTransactionResult(queryResult) {
    if (!queryResult.success) {
      return {
        Result: [{
          Code: queryResult.error,
          Message: queryResult.message
        }]
      };
    }
    
    // No transaction found
    if (queryResult.rowCount === 0) {
      return {
        Result: [{
          Code: 'R4',
          Message: 'Transaction is not Found'
        }]
      };
    }
    
    // Transaction found - check MSG_TYPE
    const transactions = queryResult.data;
    
    // Check if we have multiple rows (reversed transaction case)
    if (transactions.length > 1) {
      // Check if we have both 1200 and 1400 MSG_TYPE (reversed transaction)
      const has1200 = transactions.some(t => t.MSG_TYPE === '1200');
      const has1400 = transactions.some(t => t.MSG_TYPE === '1400');
      
      if (has1200 && has1400) {
        // This is a reversed transaction - determine type based on FROM_ACC/TO_ACC
        const transactionType = this.determineTransactionTypeFromAccounts(transactions);
        return {
          Result: [{
            Code: 'R2',
            Message: 'Transaction is already Reversed',
            TransactionType: transactionType
          }]
        };
      }
    }
    
    // Single transaction case
    const transaction = transactions[0];
    const msgType = transaction.MSG_TYPE;
    const workProgress = transaction.WORK_PROGRESS;
    
    // Determine transaction type (DEBIT/CREDIT) based on business logic
    const transactionType = this.determineTransactionType(transaction);
    
   if (msgType === '1200') {
      // Handle MSG_TYPE 1200 based on WORK_PROGRESS
      if (workProgress === 'F') {
        return {
          Result: [{
            Code: 'R1',
            Message: 'Transaction Failed',
            TransactionType: transactionType
          }]
        };
      } else if (workProgress === 'S') {
        return {
          Result: [{
            Code: 'R3',
            Message: 'Transaction is already Processed',
            TransactionType: transactionType
          }]
        };
      } 
    } 
  }
  
  /**
   * Convert date from DD-MM-YYYY format to YYMMDD format for database
   * @param {string} dateString - Date in DD-MM-YYYY format (e.g., "19-03-2023")
   * @returns {string} - Date in YYMMDD format (e.g., "230319")
   */
  convertDateForDatabase(dateString) {
    try {
      // Parse the date string (DD-MM-YYYY)
      const [day, month, year] = dateString.split('-');
      
      // Convert to YYMMDD format
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const yearShort = year.slice(-2); // Get last 2 digits of year
      
      return `${yearShort}${monthPadded}${dayPadded}`;
    } catch (error) {
      console.error('❌ Error converting date format:', error);
      throw new Error('Invalid date format');
    }
  }
  
  /**
   * Determine transaction type based on transaction data
   * @param {Object} transaction - Transaction data from database
   * @returns {string} - Transaction type (DEBIT/CREDIT)
   */
  determineTransactionType(transaction) {
    // Check if FROM_ACC exists (DEBIT) or TO_ACC exists (CREDIT)
    if (transaction.FROM_ACC) {
      return 'DEBIT';
    } else if (transaction.TO_ACC) {
      return 'CREDIT';
    }
    
    // Default to DEBIT if neither exists
    return 'DEBIT';
  }
  
  /**
   * Determine transaction type from multiple transactions (reversed case)
   * @param {Array} transactions - Array of transaction data from database
   * @returns {string} - Transaction type (DEBIT/CREDIT)
   */
  determineTransactionTypeFromAccounts(transactions) {
    // Check if any transaction has FROM_ACC (DEBIT) or TO_ACC (CREDIT)
    for (const transaction of transactions) {
      if (transaction.FROM_ACC) {
        return 'DEBIT';
      } else if (transaction.TO_ACC) {
        return 'CREDIT';
      }
    }
    
    // Default to DEBIT if neither exists
    return 'DEBIT';
  }
}

module.exports = new TransactionService(); 