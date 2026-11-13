const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    customer: { type: mongoose.Schema.Types.Mixed, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], required: true },
    services: { type: [mongoose.Schema.Types.Mixed], default: [] },
    pricing: { type: mongoose.Schema.Types.Mixed, required: true },
    payment: { type: mongoose.Schema.Types.Mixed, required: true },
    staff: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['completed', 'returned'], default: 'completed', index: true },
    whatsappDelivery: {
      status: { type: String, default: 'pending' },
      sentAt: { type: Date, default: null },
      phone: { type: String, default: '' },
    },
    notes: { type: String, default: '', maxlength: 500 },
    returnDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ 'payment.mode': 1, status: 1 });

module.exports = mongoose.model('Invoice', invoiceSchema);
