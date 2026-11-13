const mongoose = require('mongoose');

const billingStaffSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    role: { type: String, default: 'Cashier', maxlength: 80 },
    register: { type: String, default: 'Counter 01', maxlength: 80 },
    phone: { type: String, default: '', maxlength: 24 },
    pinHash: { type: String, required: true },
    isActive: { type: Boolean, default: true, index: true },
    failedAttempts: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

module.exports = mongoose.model('BillingStaff', billingStaffSchema);
