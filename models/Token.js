const mongoose = require('mongoose');

const TokenSchema = new mongoose.Schema({
    customer_number: {
        type: String,
        required: true,
        index: true
    },
    customer_name: {
        type: String,
        required: true
    },
    token: {
        type: String,
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'revoked'],
        default: 'active'
    },
    expires_at: {
        type: Date,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});

// Automatically delete expired tokens after 24 hours of expiry
TokenSchema.index({ expires_at: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('Token', TokenSchema);
