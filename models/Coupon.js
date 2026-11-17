const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    title: { type: String, required: true, maxlength: 120 },
    subtitle: { type: String, default: '', maxlength: 180 },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 },
    minOrder: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null },
    firstOrderOnly: { type: Boolean, default: false },
    icon: { type: String, default: 'pricetag-outline', maxlength: 40 },
    expiresAt: { type: Date, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Coupon', couponSchema);
