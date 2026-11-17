const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sareeId: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1, default: 1 },
  },
  { timestamps: true },
);

cartItemSchema.index({ userId: 1, sareeId: 1 }, { unique: true });

module.exports = mongoose.model('CartItem', cartItemSchema);
