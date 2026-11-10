const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'admin', unique: true, immutable: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '' },
    lastLoginAt: { type: Date },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
  },
  { timestamps: true },
);

adminSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    delete ret.singleton;
    delete ret.failedLoginCount;
    delete ret.lockedUntil;
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Admin', adminSchema);
