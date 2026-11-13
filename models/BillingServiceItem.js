const mongoose = require('mongoose');

const billingServiceItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true, maxlength: 80 },
    price: { type: Number, required: true, min: 0 },
    description: { type: String, default: '', maxlength: 200 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('BillingServiceItem', billingServiceItemSchema);
