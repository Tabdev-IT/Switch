const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const Token = require('../models/Token');
const oracle = require('../utils/Oracle');
const log = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_KEY = process.env.API_KEY || 'your_fallback_api_key';

class AuthService {
    /**
     * Generate a new JWT and save it to MongoDB.
     * Denies token if the customer has no accounts (query finds no account).
     */
    async generateToken(customerNumber) {
        try {
            // 1. Check customer has at least one account – don't issue token otherwise
            const accounts = await oracle.getAccountsByCustNo(customerNumber);
            if (!accounts || accounts.length === 0) {
                log(`🚫 Token denied: No accounts found for customer ${customerNumber}`);
                const err = new Error('Customer has no accounts');
                err.code = 'NO_ACCOUNTS';
                throw err;
            }

            // 2. Fetch customer name from Oracle
            const customer = await oracle.getCustomerByNo(customerNumber);
            const customerName = customer ? customer.CUSTOMER_NAME1 : 'Unknown Customer';

            // 3. Generate JWT (no exp claim; validated via MongoDB)
            const token = jwt.sign(
                { customerNumber, customerName },
                JWT_SECRET
            );

            // 4. Save to MongoDB with a distant future date to prevent TTL deletion
            await Token.create({
                customer_number: customerNumber,
                customer_name: customerName,
                token: token,
                expires_at: new Date('9999-12-31T23:59:59Z')
            });

            log(`✅ Token generated and saved for: ${customerName} (${customerNumber})`);
            return token;
        } catch (error) {
            log(`❌ Error generating token: ${error.message}`);
            throw error;
        }
    }

    /**
     * Middleware to authenticate requests via Bearer token
     */
    async authenticate(req, res, next) {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            log('⚠️ Authentication failed: Missing or invalid Authorization header');
            return res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid token' });
        }

        const tokenString = authHeader.split(' ')[1];

        try {
            // 1. Verify JWT signature and expiration
            const decoded = jwt.verify(tokenString, JWT_SECRET);

            // 2. Check MongoDB for token status
            const dbToken = await Token.findOne({ token: tokenString, status: 'active' });

            if (!dbToken) {
                log(`🚫 Token is revoked or does not exist in DB: ${tokenString.substring(0, 15)}...`);
                return res.status(401).json({ error: 'Unauthorized', message: 'Token has been revoked or is invalid' });
            }

            req.customerNumber = decoded.customerNumber;
            req.customerName = decoded.customerName;

            log(`✅ Token verified for customer: ${req.customerNumber}`);
            next();
        } catch (error) {
            log(`❌ JWT Verification failed: ${error.message}`);
            return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
        }
    }
}

module.exports = new AuthService();
