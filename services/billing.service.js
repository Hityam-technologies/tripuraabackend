const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { getEnv } = require('../config/env');
const { ApiError } = require('../utils/ApiError');
const { randomToken } = require('../utils/tokens');
const { hashPassword, verifyPassword } = require('./auth.service');
const { getOrCreate, presentConfig } = require('./systemConfig.service');
const { recordAudit } = require('./audit.service');
const { verifyAccess } = require('./token.service');
const BillingStaff = require('../models/BillingStaff');
const BillingSession = require('../models/BillingSession');
const BillingCustomer = require('../models/BillingCustomer');
const BillingServiceItem = require('../models/BillingServiceItem');
const Invoice = require('../models/Invoice');
const InvoiceCounter = require('../models/InvoiceCounter');
const HeldBill = require('../models/HeldBill');
const Saree = require('../models/Saree');
const Category = require('../models/Category');

const DEFAULT_SERVICES = [
  { id: 'srv-1', name: 'Fall & Pico Finishing', price: 350, description: 'Hand-stitched cotton fall and precision edge pico' },
  { id: 'srv-2', name: 'Silk Tassels (Kuchu)', price: 750, description: 'Handcrafted zari and silk thread pallu tassels' },
  { id: 'srv-3', name: 'Bespoke Blouse Tailoring', price: 2500, description: 'Custom fitted designer blouse with lining' },
  { id: 'srv-4', name: 'Heritage Velvet Gift Box', price: 500, description: 'Signature gold embossed rigid keepsake box' },
];

const COUPONS = {
  HERITAGE10: { type: 'percent', value: 10 },
  ROYAL5: { type: 'percent', value: 5 },
  FESTIVE2000: { type: 'flat', value: 2000 },
};

function roundMoney(value) {
  return Math.round(Number(value) * 100) / 100;
}

function tie(query, session) {
  return session ? query.session(session) : query;
}

function opt(session, options = {}) {
  return session ? { ...options, session } : options;
}

async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (error?.code === 20 || /replica set/i.test(String(error?.message || ''))) {
      return work(null);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function stockLabel(quantity) {
  if (quantity <= 0) return 'Out of Stock';
  if (quantity <= 2) return `${quantity} Left in Stock`;
  return 'In Stock';
}

function presentStaff(staff) {
  return {
    id: String(staff._id),
    name: staff.name,
    role: staff.role,
    register: staff.register,
    phone: staff.phone || '',
  };
}

function presentCustomer(doc) {
  return {
    id: String(doc._id),
    name: doc.name,
    phone: doc.phone,
    email: doc.email || '',
    city: doc.city || '',
    address: doc.address || '',
    gstin: doc.gstin || '',
    visitsCount: doc.visitsCount || 0,
    lifetimeSpend: doc.lifetimeSpend || 0,
  };
}

function presentProduct(doc) {
  const images = [...(doc.images || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const urls = images.map((image) => image.url).filter(Boolean);
  if (!urls.length && doc.flatImageUrl) urls.push(doc.flatImageUrl);
  return {
    id: doc.id,
    title: doc.title,
    productCode: doc.productCode || '',
    category: doc.category,
    brand: doc.brand || '',
    weave: doc.weave || '',
    fabric: doc.fabric || '',
    price: doc.price,
    numericPrice: doc.price,
    mrp: doc.mrp,
    numericMrp: doc.mrp,
    stockQuantity: doc.stockQuantity || 0,
    stockStatus: doc.stockStatus || stockLabel(doc.stockQuantity || 0),
    isActive: doc.isActive !== false,
    images: urls,
    image: urls[0] || '',
  };
}

function presentInvoice(doc) {
  return {
    id: String(doc._id),
    invoiceNumber: doc.invoiceNumber,
    date: (doc.createdAt || new Date()).toISOString(),
    customer: doc.customer,
    items: doc.items,
    services: doc.services || [],
    pricing: doc.pricing,
    payment: doc.payment,
    staff: doc.staff,
    status: doc.status,
    whatsappDelivery: {
      status: doc.whatsappDelivery?.status || 'pending',
      sentAt: doc.whatsappDelivery?.sentAt ? new Date(doc.whatsappDelivery.sentAt).toISOString() : null,
      phone: doc.whatsappDelivery?.phone || '',
    },
    notes: doc.notes || '',
    returnDetails: doc.returnDetails || null,
  };
}

function signBillingToken(staff, jti) {
  const env = getEnv();
  return jwt.sign({ sub: String(staff._id) }, env.useRs256 ? env.JWT_PRIVATE_KEY : env.JWT_ACCESS_SECRET, {
    algorithm: env.useRs256 ? 'RS256' : 'HS256',
    expiresIn: '12h',
    audience: 'billing',
    issuer: 'tripuraa',
    jwtid: jti,
  });
}

async function createStaff(input) {
  const staff = await BillingStaff.create({
    name: input.name,
    role: input.role || 'Cashier',
    register: input.register || 'Counter 01',
    phone: input.phone || '',
    pinHash: await hashPassword(input.pin),
  });
  return presentStaff(staff);
}

async function listStaff() {
  const rows = await BillingStaff.find({ isActive: true }).sort({ name: 1 });
  return rows.map(presentStaff);
}

async function verifyPin(pin, meta = {}) {
  const staffRows = await BillingStaff.find({ isActive: true });
  let matched = null;
  for (const staff of staffRows) {
    if (staff.lockedUntil && staff.lockedUntil.getTime() > Date.now()) continue;
    if (await verifyPassword(staff.pinHash, pin)) {
      matched = staff;
      break;
    }
  }
  if (!matched) {
    throw new ApiError(401, 'INVALID_PIN', 'Invalid 6-digit security PIN.');
  }
  matched.failedAttempts = 0;
  matched.lockedUntil = null;
  await matched.save();
  const jti = randomToken(16);
  const token = signBillingToken(matched, jti);
  const decoded = verifyAccess(token);
  await BillingSession.create({
    jti,
    staffId: matched._id,
    expiresAt: new Date(decoded.exp * 1000),
  });
  await recordAudit({
    action: 'BILLING_LOGIN',
    resource: 'billing',
    resourceId: String(matched._id),
    description: `Staff ${matched.name} unlocked ${matched.register}`,
    actorId: String(matched._id),
    actorName: matched.name,
    ip: meta.ip || '',
    userAgent: meta.userAgent || '',
  });
  return { token, staff: presentStaff(matched) };
}

async function logout(staff, jti, meta = {}) {
  if (jti) await BillingSession.deleteOne({ jti });
  await recordAudit({
    action: 'BILLING_LOGOUT',
    resource: 'billing',
    resourceId: String(staff._id),
    description: `Staff ${staff.name} locked the register`,
    actorId: String(staff._id),
    actorName: staff.name,
    ip: meta.ip || '',
    userAgent: meta.userAgent || '',
  });
}

async function ensureServices() {
  const count = await BillingServiceItem.countDocuments();
  if (count === 0) await BillingServiceItem.insertMany(DEFAULT_SERVICES);
}

async function listServices() {
  await ensureServices();
  const rows = await BillingServiceItem.find({ isActive: true }).sort({ name: 1 }).lean();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    price: row.price,
    description: row.description || '',
  }));
}

async function gstSettings() {
  const config = presentConfig(await getOrCreate());
  return { gstRate: config.gstRate, gstInclusive: config.gstInclusive };
}

function calculateTotals({ items = [], services = [], discountType = 'none', discountValue = 0, couponCode = '', gstRate = 5 }) {
  const itemsSubtotal = roundMoney(items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 1), 0));
  const servicesSubtotal = roundMoney(services.reduce((sum, service) => sum + (Number(service.price) || 0), 0));
  const grossTotal = roundMoney(itemsSubtotal + servicesSubtotal);
  let discountTotal = 0;
  const coupon = COUPONS[String(couponCode || '').trim().toUpperCase()];
  if (coupon?.type === 'percent') discountTotal = Math.round(itemsSubtotal * (coupon.value / 100));
  else if (coupon?.type === 'flat') discountTotal = Math.min(coupon.value, itemsSubtotal);
  else if (discountType === 'percent') {
    const pct = Math.min(100, Math.max(0, Number(discountValue) || 0));
    discountTotal = Math.round((itemsSubtotal * pct) / 100);
  } else if (discountType === 'flat') {
    discountTotal = Math.min(grossTotal, Math.max(0, Number(discountValue) || 0));
  }
  const netBeforeTax = roundMoney(Math.max(0, grossTotal - discountTotal));
  const rate = Math.min(100, Math.max(0, Number(gstRate) || 0));
  const taxableAmount = rate === 0 ? netBeforeTax : roundMoney(netBeforeTax / (1 + rate / 100));
  const totalGst = roundMoney(netBeforeTax - taxableAmount);
  const cgst = roundMoney(totalGst / 2);
  const sgst = roundMoney(totalGst - cgst);
  return {
    itemsSubtotal,
    servicesSubtotal,
    grossTotal,
    discountTotal,
    taxableAmount,
    gstRate: rate,
    cgst,
    sgst,
    totalGst,
    grandTotal: netBeforeTax,
  };
}

async function searchProducts(query) {
  const filter = { deletedAt: null, isActive: true };
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.stock === 'in_stock') filter.stockQuantity = { $gt: 0 };
  if (query.stock === 'low_stock') filter.stockQuantity = { $gt: 0, $lte: 2 };
  if (query.stock === 'out_of_stock') filter.stockQuantity = 0;
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['title', 'brand', 'weave', 'fabric', 'productCode', 'id'].map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    }));
  }
  const rows = await Saree.find(filter).sort({ title: 1 }).limit(80).lean();
  return rows.map(presentProduct);
}

async function listCategories() {
  const rows = await Category.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
  return rows.map((row) => ({ id: row.id, label: row.label }));
}

function buildPayment(payment, grandTotal) {
  const mode = payment.mode;
  if (mode === 'cash') {
    const received = roundMoney(payment.amountReceived ?? grandTotal);
    if (received + 0.001 < grandTotal) {
      throw new ApiError(400, 'PAYMENT_SHORT', 'Cash received is less than the amount due.');
    }
    return {
      mode,
      status: 'paid',
      referenceId: payment.referenceId || '',
      amountReceived: received,
      changeGiven: roundMoney(received - grandTotal),
      cardNetwork: '',
      cardLast4: '',
      splitDetails: null,
    };
  }
  if (mode === 'split') {
    const parts = payment.splitDetails || {};
    const cash = roundMoney(parts.cash || 0);
    const upi = roundMoney(parts.upi || 0);
    const card = roundMoney(parts.card || 0);
    const sum = roundMoney(cash + upi + card);
    if (Math.abs(sum - grandTotal) > 0.05) {
      throw new ApiError(400, 'PAYMENT_MISMATCH', 'Split amounts must add up to the invoice total.');
    }
    return {
      mode,
      status: 'paid',
      referenceId: payment.referenceId || '',
      amountReceived: grandTotal,
      changeGiven: 0,
      cardNetwork: payment.cardNetwork || '',
      cardLast4: payment.cardLast4 || '',
      splitDetails: { cash, upi, card },
    };
  }
  if (!payment.referenceId || payment.referenceId.length < 4) {
    throw new ApiError(400, 'PAYMENT_REFERENCE', 'A payment reference is required for UPI and card.');
  }
  return {
    mode,
    status: 'paid',
    referenceId: payment.referenceId,
    amountReceived: grandTotal,
    changeGiven: 0,
    cardNetwork: mode === 'card' ? (payment.cardNetwork || '') : '',
    cardLast4: mode === 'card' ? (payment.cardLast4 || '') : '',
    splitDetails: null,
  };
}

async function createInvoice(input, staff, meta = {}) {
  const existing = await Invoice.findOne({ idempotencyKey: input.idempotencyKey });
  if (existing) return presentInvoice(existing);

  let created;
  try {
    created = await withTransaction(async (session) => {
      const again = await tie(Invoice.findOne({ idempotencyKey: input.idempotencyKey }), session);
      if (again) return again;

      const settings = await gstSettings();
      const serviceCatalog = await listServices();
      const chosenServices = input.services.map((entry) => {
        const known = serviceCatalog.find((service) => service.id === entry.id);
        if (!known) throw new ApiError(400, 'UNKNOWN_SERVICE', 'One of the finishing services is not on the register.');
        return { id: known.id, name: known.name, price: known.price };
      });

      const quotes = [];
      for (const line of input.items) {
        if (line.isCustom) {
          if (!line.title || !line.price) throw new ApiError(400, 'INVALID_ITEM', 'A custom line needs a name and a price.');
          quotes.push({ line, saree: null });
          continue;
        }
        const saree = await tie(Saree.findOne({ id: line.sareeId, deletedAt: null, isActive: true }), session).lean();
        if (!saree) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'A saree on this bill could not be found.');
        if ((saree.stockQuantity || 0) < line.quantity) {
          throw new ApiError(409, 'INSUFFICIENT_STOCK', `Insufficient inventory for "${saree.title}". Available stock: ${saree.stockQuantity || 0}.`);
        }
        quotes.push({ line, saree });
      }

      const soldLines = quotes.map(({ line, saree }) => {
        if (!saree) {
          return {
            sareeId: '',
            productCode: 'ADDON',
            title: line.title,
            weave: 'Custom Add-on',
            fabric: '',
            price: roundMoney(line.price),
            mrp: roundMoney(line.price),
            quantity: line.quantity,
            hsnCode: '9988',
            discount: 0,
            subtotal: roundMoney(line.price * line.quantity),
            image: '',
            isCustom: true,
          };
        }
        return {
          sareeId: saree.id,
          productCode: saree.productCode || '',
          title: saree.title,
          weave: saree.weave || '',
          fabric: saree.fabric || '',
          price: saree.price,
          mrp: saree.mrp,
          quantity: line.quantity,
          hsnCode: '5007',
          discount: 0,
          subtotal: roundMoney(saree.price * line.quantity),
          image: saree.flatImageUrl || saree.images?.[0]?.url || '',
          isCustom: false,
        };
      });

      const pricing = calculateTotals({
        items: soldLines,
        services: chosenServices,
        discountType: input.discountType,
        discountValue: input.discountValue,
        couponCode: input.couponCode,
        gstRate: settings.gstRate,
      });
      const payment = buildPayment(input.payment, pricing.grandTotal);

      for (const quote of quotes) {
        if (!quote.saree) continue;
        const updated = await Saree.findOneAndUpdate(
          { id: quote.saree.id, deletedAt: null, isActive: true, stockQuantity: { $gte: quote.line.quantity } },
          { $inc: { stockQuantity: -quote.line.quantity } },
          opt(session, { returnDocument: 'after' }),
        );
        if (!updated) {
          throw new ApiError(409, 'INSUFFICIENT_STOCK', `Insufficient inventory for "${quote.saree.title}". Available stock: ${quote.saree.stockQuantity || 0}.`);
        }
        updated.stockStatus = stockLabel(updated.stockQuantity);
        await updated.save(opt(session));
      }

      const counter = await InvoiceCounter.findOneAndUpdate(
        { key: 'invoice' },
        { $inc: { seq: 1 } },
        opt(session, { upsert: true, returnDocument: 'after' }),
      );
      const year = new Date().getFullYear();
      const invoiceNumber = `TS-INV-${year}-${String(counter.seq).padStart(4, '0')}`;
      const customer = {
        name: input.customer.name || 'Walk-in Guest',
        phone: input.customer.phone || '',
        email: input.customer.email || '',
        city: input.customer.city || '',
        address: input.customer.address || '',
        gstin: input.customer.gstin || '',
        isWalkIn: Boolean(input.customer.isWalkIn) || !input.customer.name,
      };
      const [invoice] = await Invoice.create([{
        invoiceNumber,
        idempotencyKey: input.idempotencyKey,
        customer,
        items: soldLines,
        services: chosenServices.map((service) => ({ name: service.name, price: service.price })),
        pricing,
        payment,
        staff: presentStaff(staff),
        status: 'completed',
        whatsappDelivery: {
          status: 'pending',
          sentAt: null,
          phone: customer.phone || '',
        },
        notes: input.notes || '',
      }], opt(session));

      const digits = phoneDigits(customer.phone);
      if (digits.length === 10) {
        await BillingCustomer.findOneAndUpdate(
          { phone: digits },
          {
            $setOnInsert: { name: customer.name, phone: digits },
            $set: {
              email: customer.email || '',
              city: customer.city || '',
              address: customer.address || '',
              gstin: customer.gstin || '',
            },
            $inc: { visitsCount: 1, lifetimeSpend: pricing.grandTotal },
          },
          opt(session, { upsert: true }),
        );
      }
      return invoice;
    });
  } catch (error) {
    if (error?.code === 11000) {
      const raced = await Invoice.findOne({ idempotencyKey: input.idempotencyKey });
      if (raced) return presentInvoice(raced);
    }
    throw error;
  }

  await recordAudit({
    action: 'CREATE_INVOICE',
    resource: 'billing',
    resourceId: created.invoiceNumber,
    description: `Generated Invoice ${created.invoiceNumber} for ${created.customer.name} via ${created.payment.mode}`,
    actorId: String(staff._id),
    actorName: staff.name,
    ip: meta.ip || '',
    userAgent: meta.userAgent || '',
  });
  return presentInvoice(created);
}

async function listInvoices(query) {
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.paymentMode && query.paymentMode !== 'all') filter['payment.mode'] = query.paymentMode;
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { invoiceNumber: { $regex: term, $options: 'i' } },
      { 'customer.name': { $regex: term, $options: 'i' } },
      { 'customer.phone': { $regex: term, $options: 'i' } },
    ];
  }
  const total = await Invoice.countDocuments(filter);
  const rows = await Invoice.find(filter).sort({ createdAt: -1 }).skip((query.page - 1) * query.limit).limit(query.limit);
  return {
    items: rows.map(presentInvoice),
    total,
    page: query.page,
    limit: query.limit,
    totalPages: Math.ceil(total / query.limit) || 1,
  };
}

async function getInvoice(id) {
  const row = await Invoice.findOne({ $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { invoiceNumber: id }] });
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Invoice not found.');
  return presentInvoice(row);
}

async function processReturn(id, reason, staff, meta = {}) {
  const invoice = await withTransaction(async (session) => {
    const row = await tie(Invoice.findOne({
      $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { invoiceNumber: id }],
    }), session);
    if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Invoice not found.');
    if (row.status === 'returned') throw new ApiError(409, 'ALREADY_RETURNED', 'Invoice has already been returned.');
    for (const item of row.items) {
      if (item.isCustom || !item.sareeId) continue;
      const saree = await Saree.findOneAndUpdate(
        { id: item.sareeId },
        { $inc: { stockQuantity: item.quantity } },
        opt(session, { returnDocument: 'after' }),
      );
      if (saree) {
        saree.stockStatus = stockLabel(saree.stockQuantity);
        await saree.save(opt(session));
      }
    }
    row.status = 'returned';
    row.returnDetails = {
      returnedAt: new Date().toISOString(),
      reason,
      refundedAmount: row.pricing.grandTotal,
    };
    await row.save(opt(session));
    return row;
  });
  await recordAudit({
    action: 'RETURN_INVOICE',
    resource: 'billing',
    resourceId: invoice.invoiceNumber,
    description: `Processed return for Invoice ${invoice.invoiceNumber}`,
    actorId: String(staff._id),
    actorName: staff.name,
    ip: meta.ip || '',
    userAgent: meta.userAgent || '',
  });
  return presentInvoice(invoice);
}

async function markWhatsAppShared(id) {
  const row = await Invoice.findOne({
    $or: [{ _id: mongoose.isValidObjectId(id) ? id : null }, { invoiceNumber: id }],
  });
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Invoice not found.');
  row.whatsappDelivery = {
    status: row.customer?.phone ? 'sent' : 'pending',
    sentAt: row.customer?.phone ? new Date() : null,
    phone: row.customer?.phone || '',
  };
  await row.save();
  return { success: true };
}

function presentHeld(doc) {
  return {
    id: String(doc._id),
    customer: doc.customer,
    items: doc.items,
    services: doc.services || [],
    heldAt: doc.createdAt.toISOString(),
    note: doc.note || '',
  };
}

async function listHeld(staff) {
  const rows = await HeldBill.find({ staffId: String(staff._id) }).sort({ createdAt: -1 });
  return rows.map(presentHeld);
}

async function holdBill(input, staff) {
  const row = await HeldBill.create({
    customer: input.customer || {},
    items: input.items,
    services: input.services || [],
    note: input.note || '',
    staffId: String(staff._id),
    staffName: staff.name,
  });
  return presentHeld(row);
}

async function resumeHeld(id, staff) {
  const row = await HeldBill.findOneAndDelete({ _id: id, staffId: String(staff._id) });
  if (!row) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Held bill not found.');
  return presentHeld(row);
}

async function discardHeld(id, staff) {
  const result = await HeldBill.deleteOne({ _id: id, staffId: String(staff._id) });
  if (!result.deletedCount) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Held bill not found.');
}

async function soldOutProducts(query = {}) {
  const filter = { deletedAt: null, stockQuantity: { $lte: 0 } };
  if (query.category && query.category !== 'all') filter.category = query.category;
  if (query.search) {
    const term = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['title', 'productCode', 'weave', 'fabric'].map((field) => ({
      [field]: { $regex: term, $options: 'i' },
    }));
  }
  const rows = await Saree.find(filter).sort({ updatedAt: -1 }).limit(80).lean();
  const invoices = await Invoice.find({ status: 'completed' }).sort({ createdAt: -1 }).limit(200).lean();
  return rows.map((saree) => {
    const related = invoices.find((invoice) => (invoice.items || []).some((item) => item.sareeId === saree.id));
    return {
      ...presentProduct(saree),
      soldOutAt: related?.createdAt || saree.updatedAt,
      relatedInvoice: related ? presentInvoice(related) : null,
    };
  });
}

async function restockProduct(sareeId, quantity, staff) {
  const saree = await Saree.findOneAndUpdate(
    { id: sareeId, deletedAt: null },
    { $inc: { stockQuantity: quantity } },
    { returnDocument: 'after' },
  );
  if (!saree) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Saree not found.');
  saree.stockStatus = stockLabel(saree.stockQuantity);
  await saree.save();
  await recordAudit({
    action: 'INVENTORY_RESTOCK',
    resource: 'sarees',
    resourceId: saree.id,
    description: `Restocked "${saree.title}" with +${quantity}. Current stock: ${saree.stockQuantity}`,
    actorId: String(staff._id),
    actorName: staff.name,
  });
  return { saree: presentProduct(saree), newStock: saree.stockQuantity };
}

async function lookupCustomer(phone) {
  const digits = phoneDigits(phone);
  if (digits.length < 5) return { found: false, customer: null };
  const row = await BillingCustomer.findOne({ phone: digits });
  if (!row) return { found: false, customer: null };
  return { found: true, customer: presentCustomer(row) };
}

async function listCustomers(search) {
  const filter = {};
  if (search) {
    const term = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }
  const rows = await BillingCustomer.find(filter).sort({ updatedAt: -1 }).limit(50);
  return rows.map(presentCustomer);
}

async function createCustomer(input) {
  const phone = phoneDigits(input.phone);
  if (phone.length !== 10) throw new ApiError(400, 'INVALID_PHONE', 'Enter a 10-digit mobile number.');
  const existing = await BillingCustomer.findOne({ phone });
  if (existing) return presentCustomer(existing);
  const row = await BillingCustomer.create({
    name: input.name,
    phone,
    email: input.email || '',
    city: input.city || '',
    address: input.address || '',
    gstin: input.gstin || '',
    visitsCount: 0,
    lifetimeSpend: 0,
  });
  return presentCustomer(row);
}

async function todaySummary(staff) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const bills = await Invoice.find({ createdAt: { $gte: start }, status: 'completed' });
  let cashTotal = 0;
  let upiTotal = 0;
  let cardTotal = 0;
  let totalRevenue = 0;
  bills.forEach((invoice) => {
    const amount = Number(invoice.pricing?.grandTotal) || 0;
    totalRevenue += amount;
    const mode = invoice.payment?.mode;
    if (mode === 'cash') cashTotal += amount;
    else if (mode === 'upi') upiTotal += amount;
    else if (mode === 'card') cardTotal += amount;
    else if (mode === 'split' && invoice.payment.splitDetails) {
      cashTotal += invoice.payment.splitDetails.cash || 0;
      upiTotal += invoice.payment.splitDetails.upi || 0;
      cardTotal += invoice.payment.splitDetails.card || 0;
    }
  });
  const heldBillsCount = await HeldBill.countDocuments({ staffId: String(staff._id) });
  return {
    date: start.toISOString().slice(0, 10),
    billsCount: bills.length,
    totalRevenue: roundMoney(totalRevenue),
    cashTotal: roundMoney(cashTotal),
    upiTotal: roundMoney(upiTotal),
    cardTotal: roundMoney(cardTotal),
    averageOrderValue: bills.length ? Math.round(totalRevenue / bills.length) : 0,
    heldBillsCount,
  };
}

module.exports = {
  calculateTotals,
  createStaff,
  listStaff,
  verifyPin,
  logout,
  listServices,
  gstSettings,
  searchProducts,
  listCategories,
  createInvoice,
  listInvoices,
  getInvoice,
  processReturn,
  markWhatsAppShared,
  listHeld,
  holdBill,
  resumeHeld,
  discardHeld,
  soldOutProducts,
  restockProduct,
  lookupCustomer,
  listCustomers,
  createCustomer,
  todaySummary,
  presentStaff,
};
