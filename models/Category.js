const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    label: { type: String, required: true, trim: true },
    coverImageUrl: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

categorySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Category', categorySchema);
