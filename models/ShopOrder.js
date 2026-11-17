const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    sareeId: { type: String, required: true },
    title: { type: String, required: true },
    productCode: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String, default: '' },
    fabric: { type: String, default: '' },
    weave: { type: String, default: '' },
  },
  { _id: false },
);

const addressSnapshotSchema = new mongoose.Schema(
  {
    fullName: { type: String, default: '' },
    phone: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    postalCode: { type: String, default: '' },
  },
  { _id: false },
);

const shopOrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    customerName: { type: String, default: '' },
    customerPhone: { type: String, default: '' },
    customerEmail: { type: String, default: '' },
    status: {
      type: String,
      enum: ['CONFIRMED', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'],
      default: 'CONFIRMED',
      index: true,
    },
    items: { type: [orderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, default: 0, min: 0 },
    shippingFee: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
    promoCode: { type: String, default: '' },
    paymentMethod: { type: String, enum: ['ONLINE', 'COD'], required: true },
    paymentStatus: {
      type: String,
      enum: ['PENDING', 'PAID', 'PAY_ON_DELIVERY', 'REFUNDED'],
      required: true,
    },
    paymentGatewayRef: { type: String, default: '' },
    shippingAddress: { type: addressSnapshotSchema, required: true },
    estimatedDelivery: { type: String, default: '' },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

shopOrderSchema.index({ createdAt: -1 });
shopOrderSchema.index({ orderNumber: 1, customerPhone: 1, customerName: 1 });

module.exports = mongoose.model('ShopOrder', shopOrderSchema);
