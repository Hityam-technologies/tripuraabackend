const mongoose = require('mongoose');

const heldBillSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.Mixed, required: true },
    items: { type: [mongoose.Schema.Types.Mixed], default: [] },
    services: { type: [mongoose.Schema.Types.Mixed], default: [] },
    note: { type: String, default: '', maxlength: 240 },
    staffId: { type: String, required: true, index: true },
    staffName: { type: String, default: '' },
  },
  { timestamps: true },
);

module.exports = mongoose.model('HeldBill', heldBillSchema);
