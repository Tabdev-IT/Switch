const express = require('express');
const router = express.Router();
const Otp = require('../models/Otp');
const smsService = require('../services/smsService');
const log = require('../utils/logger');

// Generate a random 6-digit number
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * @route POST /api/otp/send
 * @desc Generate and send an OTP
 */
router.post('/send', async (req, res) => {
    try {
        const { phoneNumber, identifier } = req.body;
        const targetId = phoneNumber || identifier;

        if (!targetId) {
            return res.status(400).json({ success: false, message: 'Phone number or Identifier is required' });
        }

        const otpCode = generateOTP();

        // Save or update the OTP in the database for the given identifier
        await Otp.findOneAndUpdate(
            { identifier: targetId },
            { otpCode, createdAt: Date.now() },
            { upsert: true, new: true }
        );

        // Send the SMS (ignores real phone number for testing)
        await smsService.sendOtpSms(targetId, otpCode);

        log(`✅ OTP generated and sent for: ${targetId}`);

        res.status(200).json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        log(`❌ Error sending OTP: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to send OTP', error: error.message });
    }
});

/**
 * @route POST /api/otp/verify
 * @desc Verify an OTP
 */
router.post('/verify', async (req, res) => {
    try {
        const { phoneNumber, identifier, otpCode } = req.body;
        const targetId = phoneNumber || identifier;

        if (!targetId || !otpCode) {
            return res.status(400).json({ success: false, message: 'Phone number/Identifier and OTP code are required' });
        }

        // Check if OTP exists and matches
        const otpRecord = await Otp.findOne({ identifier: targetId, otpCode });

        if (!otpRecord) {
            log(`🚫 Invalid or expired OTP for: ${targetId}`);
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }

        // Delete the OTP record so it can't be used again
        await Otp.deleteOne({ _id: otpRecord._id });

        log(`✅ OTP verified successfully for: ${targetId}`);

        res.status(200).json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        log(`❌ Error verifying OTP: ${error.message}`);
        res.status(500).json({ success: false, message: 'Failed to verify OTP', error: error.message });
    }
});

module.exports = router;
