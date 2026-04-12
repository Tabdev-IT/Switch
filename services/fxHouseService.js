const oracle = require('../utils/Oracle');
const log = require('../utils/logger');

class FXHouseService {
    /**
     * Get all balances for a customer.
     * Flow: Bearer token → customer number → find his accounts (cbl_info by CUST_NO) →
     * for each account, balance comes from STTM_ACCOUNT_BALANCE by CUST_AC_NO (same as tab-backend).
     * Returns whatever accounts he has (e.g. USD, LYD).
     */
    async getAllBalances(customerNumber) {
        log(`🔍 FXHouseService.getAllBalances: Cust=${customerNumber}`);
        const accounts = await oracle.getAccountsByCustNo(customerNumber);
        // getAccountsByCustNo joins STTM_ACCOUNT_BALANCE on CUST_AC_NO, so balance is by account number
        log(`📊 Accounts and balances (by CUST_AC_NO): ${JSON.stringify(accounts)}`);
        return accounts;
    }

    /**
     * Get all account numbers for a customer (for ownership checks / accounts list).
     */
    async getAccountNumbersForCustomer(customerNumber) {
        log(`🔍 FXHouseService.getAccountNumbersForCustomer: Cust=${customerNumber}`);
        const accounts = await oracle.getAccountsByCustNo(customerNumber);
        return (accounts || []).map(acc => acc.CUST_AC_NO);
    }

    /**
     * Get balance for a single account (by CUST_AC_NO).
     */
    async getBalanceByAccountNumber(accountNumber) {
        log(`🔍 FXHouseService.getBalanceByAccountNumber: Acc=${accountNumber}`);
        const balanceInfo = await oracle.getFXBalance(accountNumber);
        if (!balanceInfo) {
            log(`⚠️  No balance found for account ${accountNumber}`);
            return null;
        }
        return {
            account_number: accountNumber,
            currency: balanceInfo.CCY,
            balance: balanceInfo.BALANCE
        };
    }

    /**
     * Check if a specific account has sufficient funds
     * (Privacy-preserving: only returns boolean)
     */
    async hasSufficientFunds(accountNumber, requiredAmount) {
        log(`🔍 FXHouseService.hasSufficientFunds: Acc=${accountNumber}, Req=${requiredAmount}`);

        const balanceInfo = await oracle.getFXBalance(accountNumber);

        if (!balanceInfo) {
            log(`⚠️  Account ${accountNumber} not found or has no balance entry. Defaulting to LYD.`);
            return { is_sufficient: false, currency: 'LYD' };
        }

        const isSufficient = balanceInfo.BALANCE >= requiredAmount;
        log(`⚖️  Check Result: Balance=${balanceInfo.BALANCE} (${balanceInfo.CCY}), Result=${isSufficient}`);

        return { is_sufficient: isSufficient, currency: balanceInfo.CCY };
    }

    /**
     * Bulk check for sufficient funds
     */
    async hasSufficientFundsBulk(checks) {
        log(`🔍 FXHouseService.hasSufficientFundsBulk: processing ${checks.length} checks`);
        const results = await Promise.all(checks.map(async (check) => {
            const { account_number, amount } = check;
            const res = await this.hasSufficientFunds(account_number, amount);
            return {
                account_number,
                amount_checked: amount,
                ...res
            };
        }));
        return results;
    }

    /**
     * Get balance for a specific customer and currency (uses customer's accounts list then balance by account)
     */
    async getBalance(customerNumber, currency) {
        const accounts = await oracle.getAccountsByCustNo(customerNumber);
        const targetAccount = accounts.find(acc => acc.CCY === currency);

        if (!targetAccount) {
            log(`⚠️ No ${currency} account found for customer ${customerNumber}`);
            return null;
        }

        const balanceInfo = await this.getBalanceByAccountNumber(targetAccount.CUST_AC_NO);
        return balanceInfo ? { ...targetAccount, ...balanceInfo } : targetAccount;
    }

    /**
     * Get account statement (Transactions) with pagination and filters
     */
    async getStatement(customerNumber, currency, params = {}) {
        const { page = 1, per_page = 15, drcr = null, fromDate = null, toDate = null } = params;
        const limit = parseInt(per_page);
        const offset = (parseInt(page) - 1) * limit;

        log(`🔍 FXHouseService.getStatement: Cust=${customerNumber}, Ccy=${currency}, Page=${page}`);

        // 1) Find the correct account number for this customer and currency
        const accounts = await oracle.getAccountsByCustNo(customerNumber);
        const dbCurrency = (currency || '').toUpperCase();
        const targetAccount = (accounts || []).find(acc => acc.CCY === dbCurrency);

        if (!targetAccount) {
            log(`⚠️ No ${dbCurrency} account found for customer ${customerNumber}`);
            return {
                data: [],
                meta: {
                    current_page: page,
                    from: 1,
                    last_page: 1,
                    per_page: limit,
                    to: 0,
                    total: 0,
                    range: `1-0 of 0`
                }
            };
        }

        const accountNumber = targetAccount.CUST_AC_NO;

        // 2) Fetch statement by account number (AC_NO) and currency
        const result = await oracle.getFXStatementByAccount(accountNumber, dbCurrency, {
            limit,
            offset,
            drcr,
            fromDate,
            toDate
        });

        const total = result.pagination.total;
        const lastPage = Math.ceil(total / limit) || 1;
        const currentPage = parseInt(page);
        const from = offset + 1;
        const to = offset + result.transactions.length;

        return {
            data: result.transactions,
            meta: {
                current_page: currentPage,
                from,
                last_page: lastPage,
                per_page: limit,
                to,
                total: total
            }
        };
    }
}

module.exports = new FXHouseService();
