const { ApiError } = require('../utils/ApiError');
const { formatInr } = require('../utils/price');
const { pageMeta } = require('../utils/pagination');
const { toCsv } = require('../utils/csv');
const Enquiry = require('../models/Enquiry');
const Saree = require('../models/Saree');
const User = require('../models/User');

const TRANSITIONS = {
  new: ['contacted', 'cancelled'],
  contacted: ['confirmed', 'closed', 'cancelled'],
  confirmed: ['closed', 'cancelled'],
  closed: [],
  cancelled: [],
};

function presentEnquiry(enquiry, user, saree) {
  return {
    id: String(enquiry._id),
    sareeId: enquiry.sareeId,
    sareeTitle: saree?.title || '',
    sareePrice: saree ? formatInr(saree.price) : '',
    message: enquiry.message,
    phone: enquiry.phone,
    status: enquiry.status,
    channel: enquiry.channel || 'app',
    customerName: user?.fullName || '',
    customerEmail: user?.email || '',
    customerPhone: enquiry.phone,
    notes: (enquiry.internalNotes || []).map((note) => ({
      id: String(note._id),
      text: note.text,
      author: note.author,
      timestamp: note.createdAt,
    })),
    createdAt: enquiry.createdAt,
    updatedAt: enquiry.updatedAt,
  };
}

async function hydrate(rows) {
  const sarees = await Saree.find({ id: { $in: rows.map((row) => row.sareeId) } }).lean();
  const users = await User.find({ _id: { $in: rows.map((row) => row.userId) } }).lean();
  const sareeMap = new Map(sarees.map((saree) => [saree.id, saree]));
  const userMap = new Map(users.map((user) => [String(user._id), user]));
  return rows.map((row) => presentEnquiry(row, userMap.get(String(row.userId)), sareeMap.get(row.sareeId)));
}

async function createEnquiry(user, { sareeId, message, phone }) {
  const saree = await Saree.findOne({ id: sareeId, isActive: true, deletedAt: null });
  if (!saree) throw new ApiError(404, 'RESOURCE_NOT_FOUND', `Saree with ID '${sareeId}' was not found.`);
  const enquiry = await Enquiry.create({
    userId: user._id,
    sareeId,
    message,
    phone: phone || user.phone,
    status: 'new',
    channel: 'app',
  });
  return presentEnquiry(enquiry, user, saree);
}

async function listMine(userId) {
  const rows = await Enquiry.find({ userId }).sort({ createdAt: -1 });
  return hydrate(rows);
}

async function adminList(query) {
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  const skip = (query.page - 1) * query.limit;
  let rows = await Enquiry.find(filter).sort({ createdAt: -1 }).lean();
  let presented = await hydrate(rows);
  if (query.search) {
    const term = query.search.toLowerCase();
    presented = presented.filter((item) =>
      [item.customerName, item.customerEmail, item.customerPhone, item.sareeTitle, item.message]
        .join(' ')
        .toLowerCase()
        .includes(term));
  }
  const total = presented.length;
  const items = presented.slice(skip, skip + query.limit);
  return { items, ...pageMeta(query.page, query.limit, total) };
}

async function adminGet(id) {
  const row = await Enquiry.findById(id);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Enquiry not found.');
  const [presented] = await hydrate([row]);
  return presented;
}

async function updateStatus(id, status, author) {
  const row = await Enquiry.findById(id);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Enquiry not found.');
  const allowed = TRANSITIONS[row.status] || [];
  if (!allowed.includes(status)) {
    throw new ApiError(409, 'INVALID_STATUS', `Cannot move an enquiry from ${row.status} to ${status}.`);
  }
  const before = row.status;
  row.status = status;
  row.internalNotes.push({
    text: `Status changed from ${before} to ${status}.`,
    author: author || 'Admin',
  });
  await row.save();
  return { before, after: (await hydrate([row]))[0] };
}

async function addNote(id, text, author) {
  const row = await Enquiry.findById(id);
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Enquiry not found.');
  row.internalNotes.push({ text, author: author || 'Admin' });
  await row.save();
  const note = row.internalNotes[row.internalNotes.length - 1];
  return {
    enquiry: (await hydrate([row]))[0],
    note: { id: String(note._id), text: note.text, author: note.author, timestamp: note.createdAt },
  };
}

async function exportCsv() {
  const rows = await Enquiry.find().sort({ createdAt: -1 });
  const presented = await hydrate(rows);
  const headers = ['ID', 'Customer Name', 'Phone', 'Email', 'Saree', 'Price', 'Status', 'Channel', 'Date'];
  const csv = toCsv(headers, presented.map((item) => [
    item.id,
    item.customerName,
    item.phone,
    item.customerEmail,
    item.sareeTitle,
    item.sareePrice,
    item.status,
    item.channel,
    item.createdAt ? new Date(item.createdAt).toISOString() : '',
  ]));
  return { csv, filename: `tripuraa-enquiries-${new Date().toISOString().slice(0, 10)}.csv` };
}

module.exports = { createEnquiry, listMine, adminList, adminGet, updateStatus, addNote, exportCsv };
