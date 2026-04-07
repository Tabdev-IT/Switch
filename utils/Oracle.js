const oracledb = require('oracledb');
require('dotenv').config();
const log = require('./logger');

const { dbConfig } = require('../config/database');

class Oracle {
    constructor() {
        this.config = {
            user: process.env.ORACLE_USER || dbConfig.user,
            password: process.env.ORACLE_PASSWORD || dbConfig.password,
            connectString: process.env.ORACLE_CONNECT_STRING || dbConfig.connectString,
            poolMin: parseInt(process.env.ORACLE_POOL_MIN) || dbConfig.poolMin || 2,
            poolMax: parseInt(process.env.ORACLE_POOL_MAX) || dbConfig.poolMax || 10,
            poolIncrement: parseInt(process.env.ORACLE_POOL_INCREMENT) || dbConfig.poolIncrement || 1,
            poolTimeout: parseInt(process.env.ORACLE_POOL_TIMEOUT) || dbConfig.poolTimeout || 60,
            queueTimeout: parseInt(process.env.ORACLE_QUEUE_TIMEOUT) || dbConfig.queueTimeout || 60000,
            _enableStats: true
        };
        this.pool = null;
    }

    async init() {
        try {
            console.log('⏳ Initializing Oracle pool...');
            this.pool = await oracledb.createPool(this.config);
            console.log('✅ Oracle connection pool initialized');
            return this.pool;
        } catch (error) {
            console.error('❌ Error initializing Oracle pool:', error);
            throw error;
        }
    }

    async getConnection() {
        try {
            if (!this.pool) {
                console.log('🔌 No pool found, initializing...');
                await this.init();
            }
            return await oracledb.getConnection();
        } catch (error) {
            console.error('❌ Error getting connection:', error);
            throw error;
        }
    }

    async execute(sql, binds = [], options = {}) {
        let connection;
        try {
            log(`📡 Executing SQL: ${sql.substring(0, 100)}...`);
            log(`🔗 Binds: ${JSON.stringify(binds)}`);
            connection = await this.getConnection();
            const result = await connection.execute(sql, binds, {
                outFormat: oracledb.OUT_FORMAT_OBJECT,
                autoCommit: true,
                ...options
            });
            log(`✅ Execution successful. Rows returned: ${result.rows ? result.rows.length : 0}`);
            return result;
        } catch (error) {
            console.error('❌ Database execution error:', error);
            throw error;
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch (err) {
                    console.error('❌ Error closing connection:', err);
                }
            }
        }
    }

    async close() {
        try {
            if (this.pool) {
                await this.pool.close(0);
                console.log('✅ Oracle connection pool closed');
            }
        } catch (error) {
            console.error('❌ Error closing Oracle pool:', error);
        }
    }

    /**
     * FX House: Get balance for a specific customer number and currency
     */
    async getFXBalance(accountNumber) {
        const sql = `
            SELECT ACY_WITHDRAWABLE_BAL as BALANCE, CCY 
            FROM FLXCUBP.STTM_ACCOUNT_BALANCE 
            WHERE CUST_AC_NO = :accountNumber
        `;
        const result = await this.execute(sql, { accountNumber });
        return result.rows[0] || null;
    }

    /**
     * FX House: Get LYD account statement (Transactions) from SMS_TRAN_TABLE.
     * Uses LCY_AMOUNT (LYD) and customer number via CUST_NO/cbl_info join.
     */
    async getFXStatementLYD(customerNumber, options = {}) {
        const { limit = 15, offset = 0, drcr = null, fromDate = null, toDate = null } = options;

        const binds = { customerNumber, currency: 'LYD', limit, offset };
        let whereClause = `
          WHERE c.CUST_NO = :customerNumber 
            AND t.AC_CCY = :currency
            AND t.AUTH_STAT = 'A'
        `;

        if (drcr) {
            whereClause += ` AND t.DRCR_IND = :drcr`;
            binds.drcr = drcr.toUpperCase() === 'CREDIT' ? 'C' : 'D';
        }

        if (fromDate) {
            const format = fromDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP >= TO_TIMESTAMP(:fromDate, '${format}')`;
            binds.fromDate = fromDate;
        }

        if (toDate) {
            const format = toDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            const val = toDate.length <= 10 ? `${toDate} 23:59:59` : toDate;
            const targetFormat = toDate.length <= 10 ? 'YYYY-MM-DD HH24:MI:SS' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP <= TO_TIMESTAMP(:toDate, '${targetFormat}')`;
            binds.toDate = val;
        }

        const fromAndJoinClause = `
          FROM FLXCUBP.SMS_TRAN_TABLE t
          LEFT JOIN FLXCUBP.STTM_TRN_CODE m ON t.TRN_CODE = m.TRN_CODE
          LEFT JOIN FLXCUBP.cbl_info c ON t.AC_NO = c.CUST_AC_NO
        `;

        const countBinds = { customerNumber, currency: 'LYD' };
        if (binds.drcr) countBinds.drcr = binds.drcr;
        if (binds.fromDate) countBinds.fromDate = binds.fromDate;
        if (binds.toDate) countBinds.toDate = binds.toDate;

        const countSql = `
          SELECT COUNT(*) as TOTAL 
          ${fromAndJoinClause}
          ${whereClause}
        `;
        const countResult = await this.execute(countSql, countBinds);
        const total = countResult.rows[0]?.TOTAL || 0;

        const sql = `
          SELECT 
            t.TRN_REF_NO as REFERENCE,
            t.AC_NO as ACCOUNT_NUMBER,
            t.DRCR_IND as DIRECTION,
            NVL(t.LCY_AMOUNT, t.FCY_AMOUNT) as AMOUNT,
            t.AC_CCY as CURRENCY,
            TO_CHAR(t.SAVE_TIMESTAMP, 'YYYY-MM-DD') as TRN_DATE,
            TO_CHAR(t.SAVE_TIMESTAMP, 'HH24:MI:SS') as TRN_TIME,
            m.TRN_DESC as DESCRIPTION
          ${fromAndJoinClause}
          ${whereClause}
          ORDER BY t.SAVE_TIMESTAMP DESC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const result = await this.execute(sql, binds);
        return {
            transactions: result.rows,
            pagination: {
                total,
                offset,
                limit
            }
        };
    }

    /**
     * FX House: Get FX (USD/EUR/...) account statement from SMS_TRAN_TABLE
     * by customer number (RELATED_CUSTOMER). Kept for compatibility but
     * new code should prefer getFXStatementByAccount for FX.
     */
    async getFXStatementFX(customerNumber, currency, options = {}) {
        const { limit = 15, offset = 0, drcr = null, fromDate = null, toDate = null } = options;

        const dbCurrency = (currency || '').toUpperCase();
        const binds = { customerNumber, currency: dbCurrency, limit, offset };

        let whereClause = `
          WHERE t.RELATED_CUSTOMER = :customerNumber 
            AND t.AC_CCY = :currency
            AND t.AUTH_STAT = 'A'
            AND t.FCY_AMOUNT IS NOT NULL
        `;

        if (drcr) {
            whereClause += ` AND t.DRCR_IND = :drcr`;
            binds.drcr = drcr.toUpperCase() === 'CREDIT' ? 'C' : 'D';
        }

        if (fromDate) {
            const format = fromDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP >= TO_TIMESTAMP(:fromDate, '${format}')`;
            binds.fromDate = fromDate;
        }

        if (toDate) {
            const format = toDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            const val = toDate.length <= 10 ? `${toDate} 23:59:59` : toDate;
            const targetFormat = toDate.length <= 10 ? 'YYYY-MM-DD HH24:MI:SS' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP <= TO_TIMESTAMP(:toDate, '${targetFormat}')`;
            binds.toDate = val;
        }

        const fromAndJoinClause = `
          FROM FLXCUBP.SMS_TRAN_TABLE t
          LEFT JOIN FLXCUBP.STTM_TRN_CODE m ON t.TRN_CODE = m.TRN_CODE
        `;

        const countBinds = { customerNumber, currency: dbCurrency };
        if (binds.drcr) countBinds.drcr = binds.drcr;
        if (binds.fromDate) countBinds.fromDate = binds.fromDate;
        if (binds.toDate) countBinds.toDate = binds.toDate;

        const countSql = `
          SELECT COUNT(*) as TOTAL 
          ${fromAndJoinClause}
          ${whereClause}
        `;
        const countResult = await this.execute(countSql, countBinds);
        const total = countResult.rows[0]?.TOTAL || 0;

        const sql = `
          SELECT 
            t.TRN_REF_NO as REFERENCE,
            t.AC_NO as ACCOUNT_NUMBER,
            t.DRCR_IND as DIRECTION,
            t.FCY_AMOUNT as AMOUNT,
            t.AC_CCY as CURRENCY,
            TO_CHAR(t.SAVE_TIMESTAMP, 'YYYY-MM-DD') as TRN_DATE,
            TO_CHAR(t.SAVE_TIMESTAMP, 'HH24:MI:SS') as TRN_TIME,
            m.TRN_DESC as DESCRIPTION
          ${fromAndJoinClause}
          ${whereClause}
          ORDER BY t.SAVE_TIMESTAMP DESC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const result = await this.execute(sql, binds);
        return {
            transactions: result.rows,
            pagination: {
                total,
                offset,
                limit
            }
        };
    }

    /**
     * FX House: Get account statement by account number (AC_NO).
     * - For LYD: amount = NVL(LCY_AMOUNT, FCY_AMOUNT)
     * - For FX (USD/EUR/...): amount = FCY_AMOUNT and FCY_AMOUNT IS NOT NULL
     */
    async getFXStatementByAccount(accountNumber, currency, options = {}) {
        const { limit = 15, offset = 0, drcr = null, fromDate = null, toDate = null } = options;
        const dbCurrency = (currency || '').toUpperCase();
        const isLYD = dbCurrency === 'LYD';

        const binds = { accountNumber, currency: dbCurrency, limit, offset };

        let whereClause = `
          WHERE t.AC_NO = :accountNumber 
            AND t.AC_CCY = :currency
        `;

        // Keep AUTH_STAT = 'A' only for LYD; for FX (USD/EUR/...), include all statuses.
        if (isLYD) {
            whereClause += ` AND t.AUTH_STAT = 'A'`;
        } else {
            whereClause += ` AND t.FCY_AMOUNT IS NOT NULL`;
        }

        if (drcr) {
            whereClause += ` AND t.DRCR_IND = :drcr`;
            binds.drcr = drcr.toUpperCase() === 'CREDIT' ? 'C' : 'D';
        }

        if (fromDate) {
            const format = fromDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP >= TO_TIMESTAMP(:fromDate, '${format}')`;
            binds.fromDate = fromDate;
        }

        if (toDate) {
            const format = toDate.length <= 10 ? 'YYYY-MM-DD' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            const val = toDate.length <= 10 ? `${toDate} 23:59:59` : toDate;
            const targetFormat = toDate.length <= 10 ? 'YYYY-MM-DD HH24:MI:SS' : 'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"';
            whereClause += ` AND t.SAVE_TIMESTAMP <= TO_TIMESTAMP(:toDate, '${targetFormat}')`;
            binds.toDate = val;
        }

        const fromAndJoinClause = `
          FROM FLXCUBP.SMS_TRAN_TABLE t
          LEFT JOIN FLXCUBP.STTM_TRN_CODE m ON t.TRN_CODE = m.TRN_CODE
        `;

        const countBinds = { accountNumber, currency: dbCurrency };
        if (binds.drcr) countBinds.drcr = binds.drcr;
        if (binds.fromDate) countBinds.fromDate = binds.fromDate;
        if (binds.toDate) countBinds.toDate = binds.toDate;

        const countSql = `
          SELECT COUNT(*) as TOTAL 
          ${fromAndJoinClause}
          ${whereClause}
        `;
        const countResult = await this.execute(countSql, countBinds);
        const total = countResult.rows[0]?.TOTAL || 0;

        const amountExpr = isLYD
            ? "NVL(t.LCY_AMOUNT, t.FCY_AMOUNT)"
            : "t.FCY_AMOUNT";

        const sql = `
          SELECT 
            t.TRN_REF_NO as REFERENCE,
            t.AC_NO as ACCOUNT_NUMBER,
            t.DRCR_IND as DIRECTION,
            ${amountExpr} as AMOUNT,
            t.AC_CCY as CURRENCY,
            TO_CHAR(t.SAVE_TIMESTAMP, 'YYYY-MM-DD') as TRN_DATE,
            TO_CHAR(t.SAVE_TIMESTAMP, 'HH24:MI:SS') as TRN_TIME,
            m.TRN_DESC as DESCRIPTION
          ${fromAndJoinClause}
          ${whereClause}
          ORDER BY t.SAVE_TIMESTAMP DESC
          OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY
        `;

        const result = await this.execute(sql, binds);
        return {
            transactions: result.rows,
            pagination: {
                total,
                offset,
                limit
            }
        };
    }

    /**
     * Public wrapper: decide which statement function to use based on currency.
     */
    async getFXStatement(customerNumber, currency, options = {}) {
        const upper = (currency || '').toUpperCase();
        if (upper === 'LYD' || !upper) {
            return this.getFXStatementLYD(customerNumber, options);
        }
        return this.getFXStatementFX(customerNumber, upper, options);
    }

    /**
     * Get customer details (name) by customer number
     */
    async getCustomerByNo(customerNumber) {
        const sql = `
            SELECT CUSTOMER_NAME1 
            FROM FLXCUBP.STTM_CUSTOMER 
            WHERE CUSTOMER_NO = :customerNumber
        `;
        const result = await this.execute(sql, { customerNumber });
        return result.rows[0] || null;
    }

    /**
     * Get all accounts for a customer number.
     * Balance is from STTM_ACCOUNT_BALANCE by CUST_AC_NO (account number), same as tab-backend.
     */
    async getAccountsByCustNo(customerNumber) {
        const sql = `
            SELECT b.CUST_AC_NO, b.CCY, b.ACY_WITHDRAWABLE_BAL as BALANCE
            FROM FLXCUBP.cbl_info c 
            JOIN FLXCUBP.STTM_ACCOUNT_BALANCE b ON c.CUST_AC_NO = b.CUST_AC_NO 
            WHERE c.CUST_NO = :customerNumber
        `;
        const result = await this.execute(sql, { customerNumber });
        return result.rows;
    }
}

module.exports = new Oracle();
