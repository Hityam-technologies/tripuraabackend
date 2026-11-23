const mongoose = require('mongoose');

const deliveryAddressSchema = new mongoose.Schema(
  {
    fullName: { type: String, trim: true, maxlength: 80 },
    phone: { type: String, trim: true, maxlength: 24 },
    addressLine1: { type: String, trim: true, maxlength: 160 },
    addressLine2: { type: String, trim: true, maxlength: 160 },
    city: { type: String, trim: true, maxlength: 80 },
    state: { type: String, trim: true, maxlength: 80 },
    postalCode: { type: String, trim: true, maxlength: 12 },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    isEmailVerified: { type: Boolean, default: false },
    avatarUrl: { type: String, default: '' },
    // ImageKit id for avatarUrl, so a new photo or a deleted account can remove the old file.
    avatarFileId: { type: String, default: '' },
    isBlocked: { type: Boolean, default: false },
    blockedReason: { type: String, default: '' },
    lastLoginAt: { type: Date },
    deletedAt: { type: Date, default: null },
    address: { type: deliveryAddressSchema },
    // Each customer shares this code. Example: CHAITAN4821.
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredById: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Saved at signup and turned into store cash only after the email code is verified.
    pendingReferralCode: { type: String, default: '', uppercase: true, trim: true },
    walletBalance: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    ret.id = String(ret._id);
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
