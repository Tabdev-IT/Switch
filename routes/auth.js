const express = require('express');
const router = express.Router();
const authService = require('../services/authService');
const Token = require('../models/Token');
const log = require('../utils/logger');

/**
 * POST /api/auth/token
 * (For testing) Generates and saves a token
 */
router.post('/token', async (req, res) => {
    const { customerNumber } = req.body;
    if (!customerNumber) {
        return res.status(400).json({ error: 'Missing customerNumber' });
    }

    try {
        const token = await authService.generateToken(customerNumber);
        res.json({ token });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

/**
 * POST /api/auth/revoke
 * Revokes a specific token
 */
router.post('/revoke', authService.authenticate, async (req, res) => {
    const authHeader = req.headers.authorization;
    const tokenString = authHeader.split(' ')[1];

    try {
        const result = await Token.findOneAndUpdate(
            { token: tokenString },
            { status: 'revoked' },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({ error: 'Token not found' });
        }

        log(`🚫 Token revoked for ${req.customerNumber}`);
        res.json({ message: 'Token revoked successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

module.exports = router;
