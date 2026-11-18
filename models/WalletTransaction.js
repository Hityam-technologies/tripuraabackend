const mongoose = require('mongoose');

const walletTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Positive adds store cash. Negative spends it or takes a reward back.
    amount: { type: Number, required: true },
    type: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    source: {
      type: String,
      enum: [
        'REFERRAL_SIGNUP_BONUS',
        'REFERRER_FIRST_ORDER_REWARD',
        'REFERRER_REWARD_REVERSED',
        'ORDER_PAYMENT',
        'ORDER_REFUND',
      ],
      required: true,
    },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'ShopOrder', default: null },
    description: { type: String, default: '', maxlength: 240 },
  },
  { timestamps: true },
);

// One signup bonus per customer, and one friend reward per order.
walletTransactionSchema.index(
  { userId: 1, source: 1 },
  { unique: true, partialFilterExpression: { source: 'REFERRAL_SIGNUP_BONUS' } },
);
walletTransactionSchema.index(
  { orderId: 1, source: 1 },
  { unique: true, partialFilterExpression: { source: 'REFERRER_FIRST_ORDER_REWARD' } },
);

module.exports = mongoose.model('WalletTransaction', walletTransactionSchema);
