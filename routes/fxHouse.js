const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const fxHouseService = require('../services/fxHouseService');
const log = require('../utils/logger');

/**
 * GET /api/fx/accounts
 * Returns account numbers for the authenticated customer (so clients can then call /balance?account_number=...).
 */
router.get('/accounts', authService.authenticate, async (req, res) => {
    log(`📥 API Route: Listing accounts for customer ${req.customerNumber}`);
    try {
        const accountNumbers = await fxHouseService.getAccountNumbersForCustomer(req.customerNumber);
        res.json({ account_numbers: accountNumbers });
    } catch (error) {
        console.error('❌ Error listing FX accounts:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

/**
 * GET /api/fx/balance
 * Bearer token → customer number → find his accounts (USD, LYD, etc.) → balance for each
 * is read from STTM_ACCOUNT_BALANCE by CUST_AC_NO (account number), like tab-backend.
 * No query params required.
 */
router.get('/balance', authService.authenticate, async (req, res) => {
    log(`📥 API Route: Balance for customer ${req.customerNumber}`);
    try {
        const accounts = await fxHouseService.getAllBalances(req.customerNumber);
        res.json({
            customer_number: req.customerNumber,
            accounts: (accounts || []).map(acc => ({
                account_number: acc.CUST_AC_NO,
                currency: acc.CCY,
                balance: acc.BALANCE
            }))
        });
    } catch (error) {
        console.error('❌ Error fetching FX balance:', error);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

/**
 * GET /api/fx/statement/:currency
 * Returns paginated statement for a specific currency
 */
router.get('/statement/:currency', authService.authenticate, async (req, res) => {
    const { currency } = req.params;
    const page = parseInt(req.query.page) || 1;
    const per_page = parseInt(req.query.per_page) || 15;
    const { drcr, fromDate, toDate } = req.query;

    log(`📥 API Route: Handling statement request for ${req.customerNumber} (${currency})`);

    try {
        const result = await fxHouseService.getStatement(req.customerNumber, currency, {
            page,
            per_page,
            drcr,
            fromDate,
            toDate
        });

        // Helper to build links
        const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;
        const buildUrl = (p) => {
            const params = new URLSearchParams(req.query);
            params.set('page', p);
            return `${baseUrl}?${params.toString()}`;
        };

        const { current_page, last_page } = result.meta;
        const accountNumber = result.data.length > 0 ? result.data[0].ACCOUNT_NUMBER : null;

        const links = {
            first: buildUrl(1),
            last: buildUrl(last_page),
            prev: current_page > 1 ? buildUrl(current_page - 1) : null,
            next: current_page < last_page ? buildUrl(current_page + 1) : null
        };

        // Build links array for the meta section similar to FCMS style:
        // previous, first 10 pages, optional "...", last 2 pages, then next.
        const metaLinks = [];
        metaLinks.push({ url: links.prev, label: "&laquo; السابق", active: false });

        if (last_page <= 10) {
            // If total pages are 10 or less, show all
            for (let i = 1; i <= last_page; i++) {
                metaLinks.push({
                    url: buildUrl(i),
                    label: i.toString(),
                    active: i === current_page
                });
            }
        } else {
            const maxInitial = 10;
            // First 10 pages
            for (let i = 1; i <= maxInitial; i++) {
                metaLinks.push({
                    url: buildUrl(i),
                    label: i.toString(),
                    active: i === current_page
                });
            }

            // Ellipsis entry
            metaLinks.push({
                url: null,
                label: "...",
                active: false
            });

            // Last two pages (avoid duplicates if they overlap with first 10)
            if (last_page - 1 > maxInitial) {
                metaLinks.push({
                    url: buildUrl(last_page - 1),
                    label: (last_page - 1).toString(),
                    active: (last_page - 1) === current_page
                });
            }
            metaLinks.push({
                url: buildUrl(last_page),
                label: last_page.toString(),
                active: last_page === current_page
            });
        }

        // Next page (like "التالي »")
        metaLinks.push({ url: links.next, label: "التالي &raquo;", active: false });

        res.json({
            customer_number: req.customerNumber,
            account_number: accountNumber,
            currency: currency.toUpperCase(),
            data: result.data.map(txn => ({
                reference: txn.REFERENCE,
                direction: txn.DIRECTION,
                amount: txn.AMOUNT,
                ac_ccy: txn.CURRENCY,
                date: txn.TRN_DATE,
                time: txn.TRN_TIME,
                description: txn.DESCRIPTION
            })),
            links: links,
            meta: {
                ...result.meta,
                links: metaLinks,
                path: baseUrl
            }
        });
    } catch (error) {
        log(`❌ Error fetching FX statement: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

/**
 * GET /api/fx/statement
 * (Legacy/Redirect to default currency or error)
 */
router.get('/statement', authService.authenticate, (req, res) => {
    res.status(400).json({ error: 'Bad Request', message: 'Please specify a currency (e.g., /api/fx/statement/lyd)' });
});

/**
 * POST /api/fx/verify-funds
 * Privacy-preserving funds verification (Supports Bulk)
 */
router.post('/verify-funds', authService.authenticate, async (req, res) => {
    const isBulk = Array.isArray(req.body);
    const checks = isBulk ? req.body : [req.body];

    // Basic validation
    for (const check of checks) {
        if (!check.account_number || check.amount === undefined) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'All checks must include account_number and amount'
            });
        }
    }

    try {
        const results = await fxHouseService.hasSufficientFundsBulk(checks);

        // If single request, return single object for backward compat, else return array
        res.json(isBulk ? results : results[0]);
    } catch (error) {
        log(`❌ Error in verify-funds: ${error.message}`);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

module.exports = router;
