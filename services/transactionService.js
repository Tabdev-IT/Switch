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

    // Format TXNAMT to 12 digits: multiply by 1000 (append three zeros effectively) and left-pad with zeros
    const numericAmount = parseFloat(TXNAMT);
    const amountInMinorUnits = Math.round(numericAmount * 1000);
    const formattedAmount = String(amountInMinorUnits).padStart(12, '0');

    console.log('💰 Amount formatting:', {
      original: TXNAMT,
      parsedNumeric: numericAmount,
      minorUnits: amountInMinorUnits,
      final: formattedAmount
    });
    console.log('🔢 STAN formatting:', { original: STAN, final: formattedSTAN });

    // Also select TRN_REF_NO and FROM_ACC for reversal lookup
    const query = `
      SELECT 
        RRN, STAN, TXN_AMT, TERM_ID, SETL_DATE, MSG_TYPE, FROM_ACC, TO_ACC, WORK_PROGRESS, TRN_REF_NO
      FROM flxcubp.SWTB_TXN_LOG
      WHERE 
        RRN = :1 AND 
        STAN = :2 AND 
        TXN_AMT = :3 AND 
        TERM_ID = :4 AND 
        SETL_DATE = :5
    `;

    const bindParams = [RRN, formattedSTAN, formattedAmount, TERMID, convertedDate];

    console.log('📡 Executing Inquired SQL:', query.trim());
    console.log('🔗 With binds:', JSON.stringify(bindParams));

    let connection;
    try {
      connection = await getConnection();
      const result = await connection.execute(query, bindParams);

      console.log(`✅ Query successful, result rows: ${result.rows ? result.rows.length : 0}`);
      if (result.rows && result.rows.length > 0) {
        console.log('📄 First row sample:', JSON.stringify(result.rows[0]));
      }

      return {
        success: true,
        data: result.rows,
        rowCount: result.rows.length,
        // Store original numeric amount for reversal matching
        originalAmount: numericAmount
      };

    } catch (error) {
      console.error('❌ Database query error in lookupTransaction:');
      console.error('Error Code:', error.errorNum);
      console.error('Error Message:', error.message);
      console.error('Full Error:', error);

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
        message: `Core bank system error: ${error.message}`
      };

    } finally {
      if (connection) {
        await closeConnection(connection);
      }
    }
  }

  /**
   * Check SMS_TRAN_TABLE for a credit reversal row matching the original deducted payment.
   * The reversal entry will have:
   *   - INSTRUMENT_CODE = TRN_REF_NO of the original deducted payment
   *   - AC_NO           = the account the money was deducted from
   *   - LCY_AMOUNT      = the original amount (as stored in Oracle, not minor units)
   *   - DRCR_IND        = 'C' (Credit — money was returned)
   *
   * @param {string} trnRefNo      - TRN_REF_NO from SWTB_TXN_LOG (the original payment)
   * @param {string} accountNumber - FROM_ACC from SWTB_TXN_LOG
   * @param {number} amount        - Original numeric amount (e.g. 100.5)
   * @returns {Promise<{reversedAt: number, transactionReference: string}|null>}
   */
  async checkReversalInSmsTable(trnRefNo, accountNumber, amount) {
    if (!trnRefNo || !accountNumber) {
      console.log('⚠️ Skipping reversal check – missing trnRefNo or accountNumber');
      return null;
    }

    console.log('🔍 Checking SMS_TRAN_TABLE for reversal:', { trnRefNo, accountNumber, amount });

    const query = `
      SELECT 
        t.TRN_REF_NO,
        t.SAVE_TIMESTAMP
      FROM FLXCUBP.SMS_TRAN_TABLE t
      WHERE 
        t.INSTRUMENT_CODE = :trnRefNo
        AND t.AC_NO        = :accountNumber
        AND t.LCY_AMOUNT   = :amount
        AND t.DRCR_IND     = 'C'
      FETCH FIRST 1 ROWS ONLY
    `;

    const bindParams = { trnRefNo, accountNumber, amount };

    let connection;
    try {
      connection = await getConnection();
      const result = await connection.execute(query, bindParams);

      if (!result.rows || result.rows.length === 0) {
        console.log('ℹ️ No reversal credit entry found in SMS_TRAN_TABLE');
        return null;
      }

      const row = result.rows[0];
      const saveTimestamp = row.SAVE_TIMESTAMP || row.save_timestamp;
      const creditTrnRefNo = row.TRN_REF_NO || row.trn_ref_no;

      console.log('✅ Reversal entry found in SMS_TRAN_TABLE:', { creditTrnRefNo, saveTimestamp });

      // Convert SAVE_TIMESTAMP to Unix 10-digit (seconds)
      let reversedAt = null;
      if (saveTimestamp) {
        const tsDate = saveTimestamp instanceof Date ? saveTimestamp : new Date(saveTimestamp);
        reversedAt = Math.floor(tsDate.getTime() / 1000);
      }

      return {
        reversedAt,
        transactionReference: creditTrnRefNo
      };

    } catch (error) {
      console.error('❌ Error checking SMS_TRAN_TABLE for reversal:', error.message);
      return null; // Non-blocking: don't fail the main response
    } finally {
      if (connection) {
        await closeConnection(connection);
      }
    }
  }

  /**
   * Fetch SAVE_TIMESTAMP from SMS_TRAN_TABLE for a given TRN_REF_NO and return
   * it as a Unix 10-digit timestamp (seconds). Used for both R2 (1400 row) and
   * the manual-reversal R3 path.
   *
   * @param {string} trnRefNo
   * @returns {Promise<number|null>}
   */
  async getTimestampForTrnRef(trnRefNo) {
    if (!trnRefNo) return null;

    console.log('🕐 Fetching SAVE_TIMESTAMP from SMS_TRAN_TABLE for TRN_REF_NO:', trnRefNo);

    const query = `
      SELECT t.SAVE_TIMESTAMP
      FROM FLXCUBP.SMS_TRAN_TABLE t
      WHERE t.TRN_REF_NO = :trnRefNo
      FETCH FIRST 1 ROWS ONLY
    `;

    let connection;
    try {
      connection = await getConnection();
      const result = await connection.execute(query, { trnRefNo });

      if (!result.rows || result.rows.length === 0) {
        console.log('ℹ️ No SMS_TRAN_TABLE row found for TRN_REF_NO:', trnRefNo);
        return null;
      }

      const saveTimestamp = result.rows[0].SAVE_TIMESTAMP || result.rows[0].save_timestamp;
      if (!saveTimestamp) return null;

      const tsDate = saveTimestamp instanceof Date ? saveTimestamp : new Date(saveTimestamp);
      const unix = Math.floor(tsDate.getTime() / 1000);
      console.log('✅ ReversedAt unix timestamp:', unix);
      return unix;

    } catch (error) {
      console.error('❌ Error fetching timestamp from SMS_TRAN_TABLE:', error.message);
      return null; // Non-blocking
    } finally {
      if (connection) await closeConnection(connection);
    }
  }

  /**
   * Process transaction lookup result and return appropriate response.
   * For R2 and R3, also performs a reversal check in SMS_TRAN_TABLE.
   * @param {Object} queryResult - Database query result
   * @returns {Promise<Object>} - Formatted response
   */
  async processTransactionResult(queryResult) {
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

    console.log('🔍 Transaction(s) found in database:', {
      count: transactions.length,
      transactions: transactions.map(t => ({
        RRN: t.RRN,
        STAN: t.STAN,
        TXN_AMT: t.TXN_AMT,
        MSG_TYPE: t.MSG_TYPE,
        WORK_PROGRESS: t.WORK_PROGRESS,
        FROM_ACC: t.FROM_ACC,
        TO_ACC: t.TO_ACC,
        TRN_REF_NO: t.TRN_REF_NO
      }))
    });

    // Check if we have multiple rows (reversed transaction case – 1200 + 1400 from STWB)
    if (transactions.length > 1) {
      const has1200 = transactions.some(t => t.MSG_TYPE === '1200');
      const has1400 = transactions.some(t => t.MSG_TYPE === '1400');

      if (has1200 && has1400) {
        console.log('🔄 Multiple transactions detected (1200+1400) – reversed transaction case');

        // Use 1200 row for TransactionType, 1400 row for the reversal reference
        const deduct1200Row = transactions.find(t => t.MSG_TYPE === '1200');
        const reversal1400Row = transactions.find(t => t.MSG_TYPE === '1400');
        const ref1400 = reversal1400Row?.TRN_REF_NO || reversal1400Row?.trn_ref_no || null;
        const transactionType = this.determineTransactionType(deduct1200Row || transactions[0]);

        console.log('🔁 1400 reversal row TRN_REF_NO:', ref1400);

        // Get the timestamp for that 1400 entry from SMS_TRAN_TABLE
        const reversedAt = await this.getTimestampForTrnRef(ref1400);

        // Field order: TransactionType → ReversedAt → TransactionReference
        const resultEntry = {
          Code: 'R2',
          Message: 'Transaction is already Reversed',
          TransactionType: transactionType
        };

        if (reversedAt !== null) {
          resultEntry.ReversedAt = reversedAt;
        }
        if (ref1400) {
          resultEntry.TransactionReference = ref1400;
        }

        return { Result: [resultEntry] };
      }
    }

    // Single transaction case
    const transaction = transactions[0];
    const msgType = transaction.MSG_TYPE;
    const workProgress = transaction.WORK_PROGRESS;

    console.log('📊 Processing single transaction:', {
      MSG_TYPE: msgType,
      WORK_PROGRESS: workProgress,
      TransactionType: this.determineTransactionType(transaction)
    });

    const transactionType = this.determineTransactionType(transaction);

    if (msgType === '1200') {
      if (workProgress === 'F') {
        console.log('❌ Transaction Failed (MSG_TYPE=1200, WORK_PROGRESS=F)');
        return {
          Result: [{
            Code: 'R1',
            Message: 'Transaction Failed',
            TransactionType: transactionType
          }]
        };

      } else if (workProgress === 'S') {
        console.log('✅ Transaction Success (MSG_TYPE=1200, WORK_PROGRESS=S) – checking for reversal');

        const trnRefNo = transaction.TRN_REF_NO || transaction.trn_ref_no || null;
        const accountNumber = transaction.FROM_ACC || transaction.from_acc || null;
        const amount = queryResult.originalAmount || null;

        // Check if this successfully processed payment was later reversed
        const reversalInfo = await this.checkReversalInSmsTable(trnRefNo, accountNumber, amount);

        // Field order: TransactionType → ReversedAt → TransactionReference
        const resultEntry = {
          Code: 'R3',
          Message: 'Transaction is already Processed',
          TransactionType: transactionType  // always present
        };

        if (reversalInfo) {
          // Reversal found – include when and what reference
          resultEntry.ReversedAt = reversalInfo.reversedAt;
          resultEntry.TransactionReference = reversalInfo.transactionReference;
        }

        return { Result: [resultEntry] };
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
      const [day, month, year] = dateString.split('-');
      const monthPadded = month.padStart(2, '0');
      const dayPadded = day.padStart(2, '0');
      const yearShort = year.slice(-2);
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
    if (transaction.FROM_ACC) return 'DEBIT';
    if (transaction.TO_ACC) return 'CREDIT';
    return 'DEBIT';
  }

  /**
   * Determine transaction type from multiple transactions (reversed case)
   * @param {Array} transactions - Array of transaction data from database
   * @returns {string} - Transaction type (DEBIT/CREDIT)
   */
  determineTransactionTypeFromAccounts(transactions) {
    for (const transaction of transactions) {
      if (transaction.FROM_ACC) return 'DEBIT';
      if (transaction.TO_ACC) return 'CREDIT';
    }
    return 'DEBIT';
  }
}

module.exports = new TransactionService();