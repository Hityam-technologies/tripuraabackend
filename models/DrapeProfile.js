const mongoose = require('mongoose');

const drapeProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'Saved Profile Photo' },
    imageKey: { type: String, required: true },
    imageHash: { type: String, required: true },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true },
);

module.exports = mongoose.model('DrapeProfile', drapeProfileSchema);
