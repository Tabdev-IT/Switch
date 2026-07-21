const mongoose = require('mongoose');

/**
 * LyPay Commerce bank sessions — idempotent on paymentReferenceId.
 * Statuses: AWAITING_OTP | CONFIRMING | PROCESSING | CONFIRMED |
 *           OTP_RETRIES_EXCEEDED | INSUFFICIENT_FUNDS | FAILED
 */
const commerceLypayPaymentSchema = new mongoose.Schema(
  {
    paymentReferenceId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    bankReference: { type: String, required: true },
    paymentStatus: {
      type: String,
      required: true,
      default: 'AWAITING_OTP',
      index: true
    },
    amount: { type: Number, required: true }, // milli-LYD integer
    currency: { type: String, default: 'LYD' },
    debtorBankCode: String,
    debtorAccountSchema: String,
    debtorAccountId: String,
    debtorIban: String,
    debtorAccountNo: String,
    debtorName: String,
    creditorBankCode: String,
    creditorAccountSchema: String,
    creditorAccountId: String,
    creditorName: String,
    creditorBankName: String,
    phone: String,
    switchIdentifier: String,
    otpAttempts: { type: Number, default: 0 },
    otpVerifiedAt: Date,
    switchTransactionId: { type: String, index: true },
    lypayUuid: String,
    lypayPaymentReference: String,
    lypayTransactionTimestamp: String,
    initiateRequest: mongoose.Schema.Types.Mixed,
    gatewayInitiateResponse: mongoose.Schema.Types.Mixed,
    gatewayConfirmResponse: mongoose.Schema.Types.Mixed,
    lastError: String
  },
  { timestamps: true }
);

module.exports = mongoose.model('CommerceLypayPayment', commerceLypayPaymentSchema);
