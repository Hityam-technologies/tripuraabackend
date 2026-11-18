const mongoose = require('mongoose');

// One row for the whole shop. The admin edits these amounts.
const referralProgramSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'referral', unique: true },
    enabled: { type: Boolean, default: true },
    refereeSignupBonus: { type: Number, default: 500, min: 0 },
    referrerOrderReward: { type: Number, default: 500, min: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('ReferralProgram', referralProgramSchema);
