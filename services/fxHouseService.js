const oracle = require('../utils/Oracle');
const log = require('../utils/logger');

class FXHouseService {
    /**
     * Get all account balances for a specific customer
     */
    async getAllBalances(customerNumber) {
        log(`🔍 FXHouseService.getAllBalances: Cust=${customerNumber}`);
        const accounts = await oracle.getAccountsByCustNo(customerNumber);
        log(`📊 Accounts and balances found: ${JSON.stringify(accounts)}`);
        return accounts;
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
     * Get balance for a specific customer and currency
     */
    async getBalance(customerNumber, currency) {
        const accounts = await this.getAllBalances(customerNumber);
        const targetAccount = accounts.find(acc => acc.CCY === currency);

        if (!targetAccount) {
            log(`⚠️ No ${currency} account found for customer ${customerNumber}`);
            return null;
        }

        return targetAccount;
    }

    /**
     * Get account statement (Transactions) with pagination and filters
     */
    async getStatement(customerNumber, currency, params = {}) {
        const { page = 1, per_page = 15, drcr = null, fromDate = null, toDate = null } = params;
        const limit = parseInt(per_page);
        const offset = (parseInt(page) - 1) * limit;

        log(`🔍 FXHouseService.getStatement: Cust=${customerNumber}, Ccy=${currency}, Page=${page}`);

        const result = await oracle.getFXStatement(customerNumber, currency, {
            limit,
            offset,
            drcr,
            fromDate,
            toDate
        });

        const total = result.pagination.total;
        const lastPage = Math.ceil(total / limit) || 1;
        const currentPage = parseInt(page);

        return {
            data: result.transactions,
            meta: {
                current_page: currentPage,
                from: offset + 1,
                last_page: lastPage,
                per_page: limit,
                to: offset + result.transactions.length,
                total: total
            }
        };
    }
}

module.exports = new FXHouseService();
