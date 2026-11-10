const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    author: { type: String, default: 'Admin' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const enquirySchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sareeId: { type: String, required: true },
    message: { type: String, required: true },
    phone: { type: String, required: true },
    status: {
      type: String,
      enum: ['new', 'contacted', 'confirmed', 'closed', 'cancelled'],
      default: 'new',
      index: true,
    },
    channel: { type: String, default: 'app' },
    internalNotes: { type: [noteSchema], default: [] },
  },
  { timestamps: true },
);

module.exports = mongoose.model('Enquiry', enquirySchema);
