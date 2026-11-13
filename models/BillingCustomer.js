const mongoose = require('mongoose');

const billingCustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, unique: true },
    email: { type: String, default: '', maxlength: 120 },
    city: { type: String, default: '', maxlength: 80 },
    address: { type: String, default: '', maxlength: 240 },
    gstin: { type: String, default: '', maxlength: 20 },
    visitsCount: { type: Number, default: 0 },
    lifetimeSpend: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model('BillingCustomer', billingCustomerSchema);
