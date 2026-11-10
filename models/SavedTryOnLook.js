const mongoose = require('mongoose');

const savedLookSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sareeId: { type: String, required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'TryOnJob' },
    renderKey: { type: String, default: '' },
    isFlagged: { type: Boolean, default: false },
    flagReason: { type: String, default: '' },
    removedByAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

savedLookSchema.index({ userId: 1, sareeId: 1 }, { unique: true });

module.exports = mongoose.model('SavedTryOnLook', savedLookSchema);
