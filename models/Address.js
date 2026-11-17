const mongoose = require('mongoose');

const addressSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 24 },
    addressLine1: { type: String, required: true, trim: true, maxlength: 160 },
    addressLine2: { type: String, default: '', trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    postalCode: { type: String, required: true, trim: true, maxlength: 12 },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Address', addressSchema);
