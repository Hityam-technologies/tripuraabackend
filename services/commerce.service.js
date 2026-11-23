const mongoose = require('mongoose');
const { ApiError } = require('../utils/ApiError');
const { pageMeta } = require('../utils/pagination');
const { presentSaree } = require('../utils/presenters');
const { getOrCreate, presentConfig } = require('./systemConfig.service');
const { recordAudit } = require('./audit.service');
const Saree = require('../models/Saree');
const CartItem = require('../models/CartItem');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const ShopOrder = require('../models/ShopOrder');
const InvoiceCounter = require('../models/InvoiceCounter');
const WalletTransaction = require('../models/WalletTransaction');
const referral = require('./referral.service');
const billing = require('./billing.service');

const SHIPPING_FEE = 0;
const NEXT_STATUS = {
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const DEFAULT_COUPONS = [
  { code: 'UTSAV10', title: '10% OFF on Heirloom Sarees', subtitle: 'Save 10% on your entire cart subtotal', type: 'percent', value: 0.1, minOrder: 20000, maxDiscount: 10000, icon: 'pricetag-outline' },
  { code: 'TRIPURAA', title: 'Flat ₹5,000 OFF', subtitle: 'Exclusive celebration discount on bridal wear', type: 'flat', value: 5000, minOrder: 40000, icon: 'ribbon-outline' },
  { code: 'WELCOME', title: 'Flat ₹2,000 OFF', subtitle: 'Welcome gift for your first Tripuraa Sangrahah drape', type: 'flat', value: 2000, firstOrderOnly: true, icon: 'gift-outline' },
  { code: 'FESTIVE15', title: '15% Grand Festive Savings', subtitle: 'Valid on authentic handloom silks', type: 'percent', value: 0.15, minOrder: 30000, icon: 'flame-outline' },
];

function gateway() {
  const keyId = String(process.env.RAZORPAY_KEY_ID || '').trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || '').trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

async function withTransaction(work) {
  let session = null;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (error?.code === 20 || /replica set/i.test(String(error?.message || ''))) return work(null);
    throw error;
  } finally {
    if (session) await session.endSession();
  }
}

function tie(query, session) {
  return session ? query.session(session) : query;
}

async function ensureCoupons() {
  const count = await Coupon.countDocuments();
  if (count === 0) await Coupon.insertMany(DEFAULT_COUPONS);
}

function addressFields(input) {
  return {
    fullName: input.fullName,
    phone: input.phone,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2 || '',
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
  };
}

function presentAddress(user) {
  const doc = user?.address;
  if (!doc || !String(doc.addressLine1 || '').trim()) return null;
  return {
    id: String(user._id),
    fullName: doc.fullName || user.fullName,
    phone: doc.phone || user.phone,
    addressLine1: doc.addressLine1,
    addressLine2: doc.addressLine2 || '',
    city: doc.city,
    state: doc.state,
    postalCode: doc.postalCode,
    isDefault: true,
  };
}

function snapshotAddress(user) {
  const shown = presentAddress(user);
  if (!shown) return null;
  return {
    fullName: shown.fullName,
    phone: shown.phone,
    addressLine1: shown.addressLine1,
    addressLine2: shown.addressLine2,
    city: shown.city,
    state: shown.state,
    postalCode: shown.postalCode,
  };
}

async function dropLegacyAddresses(userId) {
  await mongoose.connection.collection('addresses').deleteMany({ userId });
}

async function moveLegacyAddressesOntoCustomers() {
  const collection = mongoose.connection.collection('addresses');
  const rows = await collection.find({}).sort({ isDefault: -1, createdAt: -1 }).toArray();
  const seen = new Set();
  for (const row of rows) {
    const key = String(row.userId || '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const customer = await User.findById(row.userId);
    if (customer && !customer.address?.addressLine1 && row.addressLine1) {
      customer.address = addressFields(row);
      customer.markModified('address');
      await customer.save();
    }
    await collection.deleteMany({ userId: row.userId });
  }
}

async function loadCustomer(user) {
  const fresh = await User.findById(user._id);
  if (!fresh) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found.');
  if (fresh.address?.addressLine1) return fresh;
  const legacy = await mongoose.connection.collection('addresses')
    .find({ userId: fresh._id })
    .sort({ isDefault: -1, createdAt: -1 })
    .limit(1)
    .next();
  if (!legacy?.addressLine1) return fresh;
  fresh.address = addressFields(legacy);
  fresh.markModified('address');
  await fresh.save();
  await dropLegacyAddresses(fresh._id);
  return fresh;
}

function statusLabel(status) {
  return {
    CONFIRMED: 'Order Confirmed',
    PROCESSING: 'Packing',
    IN_TRANSIT: 'Out for Delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  }[status] || status;
}

function trackingSteps(status) {
  const steps = [
    { title: 'Order Placed' },
    { title: 'Order Confirmed' },
    { title: 'Packing' },
    { title: 'Out for Delivery' },
    { title: 'Delivered' },
  ];
  const currentIndex = {
    CONFIRMED: 2,
    PROCESSING: 3,
    IN_TRANSIT: 4,
    DELIVERED: 5,
    CANCELLED: -1,
  }[status];
  return steps.map((step, index) => ({
    ...step,
    completed: status !== 'CANCELLED' && index < currentIndex,
    current: status !== 'CANCELLED' && index === currentIndex,
  }));
}

function presentOrder(order) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    createdAt: new Date(order.createdAt).getTime(),
    dateFormatted: new Date(order.createdAt).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
    }),
    status: order.status,
    statusLabel: statusLabel(order.status),
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    walletAmount: order.walletAmount || 0,
    shippingFee: order.shippingFee,
    totalAmount: order.totalAmount,
    promoCode: order.promoCode || '',
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    estimatedDelivery: '',
    customerName: order.customerName || '',
    customerPhone: order.customerPhone || '',
    customerEmail: order.customerEmail || '',
    items: (order.items || []).map((item) => ({
      id: item.sareeId,
      productId: item.sareeId,
      title: item.title,
      productCode: item.productCode || '',
      price: item.price,
      quantity: item.quantity,
      image: item.image || null,
      fabric: item.fabric || '',
      weave: item.weave || '',
    })),
    shippingAddress: order.shippingAddress || {},
    trackingSteps: trackingSteps(order.status),
  };
}

function presentCoupon(coupon) {
  return {
    id: String(coupon._id),
    code: coupon.code,
    title: coupon.title,
    subtitle: coupon.subtitle || '',
    type: coupon.type,
    value: coupon.value,
    minOrder: coupon.minOrder || 0,
    maxDiscount: coupon.maxDiscount ?? null,
    firstOrderOnly: Boolean(coupon.firstOrderOnly),
    icon: coupon.icon || 'pricetag-outline',
    expiresAt: coupon.expiresAt || null,
    isActive: coupon.isActive !== false,
  };
}

async function loadLines(userId, session) {
  const rows = await tie(CartItem.find({ userId }).sort({ createdAt: 1 }), session);
  const sarees = await tie(Saree.find({ id: { $in: rows.map((row) => row.sareeId) }, deletedAt: null }), session);
  const byId = new Map(sarees.map((saree) => [saree.id, saree]));
  return rows.map((row) => {
    const saree = byId.get(row.sareeId) || null;
    const inStock = Boolean(saree && saree.isActive);
    return { row, saree, inStock, quantity: row.quantity };
  });
}

async function orderQuantityLimit() {
  return presentConfig(await getOrCreate()).maxOrderQuantity;
}

async function presentCart(lines) {
  const maxOrderQuantity = await orderQuantityLimit();
  const items = lines.map(({ row, saree, inStock, quantity }) => {
    const product = saree ? presentSaree(saree) : null;
    return {
      id: row.sareeId,
      productId: row.sareeId,
      title: saree?.title || 'Unavailable saree',
      productCode: saree?.productCode || '',
      price: saree ? saree.price : 0,
      quantity,
      stockQuantity: null,
      image: product?.image || null,
      fabric: saree?.fabric || '',
      weave: saree?.weave || '',
      inStock,
      product,
    };
  });
  const subtotal = items.filter((item) => item.inStock).reduce((sum, item) => sum + item.price * item.quantity, 0);
  return {
    items,
    cartCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal,
    shippingFee: SHIPPING_FEE,
    currency: 'INR',
    maxOrderQuantity,
  };
}

async function getCart(user) {
  return presentCart(await loadLines(user._id));
}

async function addItem(user, productId, quantity) {
  const cap = await orderQuantityLimit();
  const qty = Math.min(cap, Math.max(1, Number(quantity) || 1));
  const saree = await Saree.findOne({ id: productId, deletedAt: null, isActive: true });
  if (!saree) {
    throw new ApiError(409, 'OUT_OF_STOCK', 'This saree is not available to add.');
  }
  const existing = await CartItem.findOne({ userId: user._id, sareeId: productId });
  const nextQty = Math.min(cap, (existing?.quantity || 0) + qty);
  if (existing) {
    existing.quantity = nextQty;
    await existing.save();
  } else {
    await CartItem.create({ userId: user._id, sareeId: productId, quantity: nextQty });
  }
  return getCart(user);
}

async function setQuantity(user, productId, quantity) {
  const requested = Math.floor(Number(quantity));
  if (!Number.isFinite(requested) || requested <= 0) {
    await CartItem.deleteOne({ userId: user._id, sareeId: productId });
    return getCart(user);
  }
  const existing = await CartItem.findOne({ userId: user._id, sareeId: productId });
  if (!existing) throw new ApiError(404, 'NOT_IN_CART', 'That saree is not in the bag.');
  existing.quantity = Math.min(await orderQuantityLimit(), requested);
  await existing.save();
  return getCart(user);
}

async function removeItem(user, productId) {
  await CartItem.deleteOne({ userId: user._id, sareeId: productId });
  return getCart(user);
}

async function clearCart(user, session) {
  const query = CartItem.deleteMany({ userId: user._id });
  if (session) query.session(session);
  await query;
  return presentCart([]);
}

async function listAddresses(user) {
  const customer = await loadCustomer(user);
  const row = presentAddress(customer);
  return row ? [row] : [];
}

async function saveAddress(user, input) {
  const customer = await User.findById(user._id);
  if (!customer) throw new ApiError(404, 'RESOURCE_NOT_FOUND', 'Account not found.');
  customer.address = addressFields(input);
  customer.markModified('address');
  await customer.save();
  await dropLegacyAddresses(customer._id);
  await billing.rememberAppCustomer(customer, { profile: true });
  return presentAddress(customer);
}

async function removeAddress(user) {
  const customer = await loadCustomer(user);
  if (!presentAddress(customer)) throw new ApiError(404, 'ADDRESS_NOT_FOUND', 'That address was not found.');
  customer.address = undefined;
  await User.updateOne({ _id: customer._id }, { $unset: { address: 1 } });
  await dropLegacyAddresses(customer._id);
  await billing.rememberAppCustomer(customer, { profile: true });
  return { deleted: true };
}

async function makeDefault(user) {
  const customer = await loadCustomer(user);
  const row = presentAddress(customer);
  if (!row) throw new ApiError(404, 'ADDRESS_NOT_FOUND', 'That address was not found.');
  return row;
}

function quoteCoupon(coupon, subtotal, priorOrders) {
  if (!coupon || coupon.isActive === false) return { valid: false, message: 'This coupon is not active.' };
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() < Date.now()) {
    return { valid: false, message: 'This coupon has expired.' };
  }
  const minimum = coupon.minOrder || 0;
  if (subtotal < minimum) {
    return { valid: false, message: `This coupon needs an order of at least ₹${minimum.toLocaleString('en-IN')}.` };
  }
  if (coupon.firstOrderOnly && priorOrders > 0) {
    return { valid: false, message: 'This coupon is only for a first order.' };
  }
  let discount = coupon.type === 'percent'
    ? Math.round(subtotal * coupon.value)
    : Math.min(coupon.value, subtotal);
  if (coupon.type === 'percent' && coupon.maxDiscount != null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.max(0, Math.min(discount, subtotal));
  if (discount <= 0) return { valid: false, message: 'This coupon does not change this order.' };
  return {
    valid: true,
    code: coupon.code,
    discountAmount: discount,
    finalAmount: subtotal - discount + SHIPPING_FEE,
    message: 'Coupon applied successfully',
  };
}

async function priorOrderCount(userId, session) {
  const query = ShopOrder.countDocuments({ userId, status: { $ne: 'CANCELLED' } });
  return session ? query.session(session) : query;
}

async function listCoupons() {
  await ensureCoupons();
  const rows = await Coupon.find({ isActive: true }).sort({ createdAt: 1 });
  return rows.map(presentCoupon);
}

async function validateCoupon(user, code) {
  await ensureCoupons();
  const cart = await getCart(user);
  const coupon = await Coupon.findOne({ code: String(code || '').trim().toUpperCase() });
  if (!coupon) return { valid: false, message: 'This coupon code was not found.' };
  return { ...quoteCoupon(coupon, cart.subtotal, await priorOrderCount(user._id)), subtotal: cart.subtotal, shippingFee: SHIPPING_FEE };
}

async function resolveAddress(user, input) {
  if (input.shippingAddress) {
    await saveAddress(user, input.shippingAddress);
  }
  const customer = await loadCustomer(user);
  if (!snapshotAddress(customer)) {
    throw new ApiError(400, 'ADDRESS_REQUIRED', 'Add a delivery address before placing the order.');
  }
  return customer;
}

async function nextOrderNumber(session) {
  const options = { upsert: true, returnDocument: 'after' };
  if (session) options.session = session;
  const counter = await InvoiceCounter.findOneAndUpdate({ key: 'shop-order' }, { $inc: { seq: 1 } }, options);
  return `TS-${String(10000 + counter.seq)}`;
}

async function takeStock(lines) {
  for (const line of lines) {
    if (!line.inStock || !line.saree) {
      throw new ApiError(409, 'OUT_OF_STOCK', 'A saree in the bag is no longer available.');
    }
  }
}

async function restoreStock() {}

async function placeOrder(user, input) {
  if (input.paymentMethod === 'ONLINE') {
    if (!gateway()) {
      throw new ApiError(503, 'PAYMENT_UNAVAILABLE', 'Online payment is not set up yet. Place this order as cash on delivery.');
    }
    throw new ApiError(409, 'PAYMENT_REQUIRED', 'Online payment has to be verified before the order is placed.');
  }
  const addressDoc = await resolveAddress(user, input);
  const shippingAddress = snapshotAddress(addressDoc);
  if (input.promoCode) await ensureCoupons();
  return withTransaction(async (session) => {
    const lines = (await loadLines(user._id, session)).filter((line) => line.inStock);
    if (!lines.length) throw new ApiError(400, 'CART_EMPTY', 'Add a saree before placing an order.');
    const subtotal = lines.reduce((sum, line) => sum + line.saree.price * line.quantity, 0);
    const earlierOrders = await priorOrderCount(user._id, session);
    let discountAmount = 0;
    let promoCode = '';
    if (input.promoCode) {
      const coupon = await Coupon.findOne({ code: String(input.promoCode).trim().toUpperCase(), isActive: true });
      const quote = quoteCoupon(coupon, subtotal, earlierOrders);
      if (!quote.valid) throw new ApiError(400, 'COUPON_REJECTED', quote.message);
      discountAmount = quote.discountAmount;
      promoCode = quote.code;
    }
    const amountDue = Math.max(0, subtotal - discountAmount + SHIPPING_FEE);
    let walletAmount = 0;
    if (input.useWallet) {
      const payer = await tie(User.findById(user._id), session);
      walletAmount = Math.min(Math.round(Number(payer?.walletBalance) || 0), amountDue);
    }
    await takeStock(lines, session);
    const created = await ShopOrder.create([{
      orderNumber: await nextOrderNumber(session),
      userId: user._id,
      customerName: shippingAddress.fullName || user.fullName,
      customerPhone: shippingAddress.phone || user.phone,
      customerEmail: user.email || '',
      status: 'CONFIRMED',
      items: lines.map((line) => ({
        sareeId: line.saree.id,
        title: line.saree.title,
        productCode: line.saree.productCode || '',
        price: line.saree.price,
        quantity: line.quantity,
        image: presentSaree(line.saree).image || '',
        fabric: line.saree.fabric || '',
        weave: line.saree.weave || '',
      })),
      subtotal,
      discountAmount,
      walletAmount,
      shippingFee: SHIPPING_FEE,
      totalAmount: Math.max(0, amountDue - walletAmount),
      promoCode,
      paymentMethod: 'COD',
      paymentStatus: 'PAY_ON_DELIVERY',
      shippingAddress,
    }], session ? { session } : undefined);
    const order = created[0];
    if (walletAmount > 0) {
      const debited = await User.findOneAndUpdate(
        { _id: user._id, walletBalance: { $gte: walletAmount } },
        { $inc: { walletBalance: -walletAmount } },
        { returnDocument: 'after', ...(session ? { session } : {}) },
      );
      if (!debited) {
        if (!session) {
          await restoreStock(order.items, null);
          await ShopOrder.deleteOne({ _id: order._id });
        }
        throw new ApiError(409, 'WALLET_CHANGED', 'Your store cash changed. Please try the order again.');
      }
      await WalletTransaction.create([{
        userId: user._id,
        amount: -walletAmount,
        type: 'DEBIT',
        source: 'ORDER_PAYMENT',
        orderId: order._id,
        description: `Store cash used on order ${order.orderNumber}`,
      }], session ? { session } : undefined);
    }
    if (earlierOrders === 0) {
      await referral.maybeCompleteReferral({ userId: user._id, orderId: order._id, session });
    }
    await clearCart(user, session);
    return presentOrder(order);
  });
}

async function listOrders(user) {
  const rows = await ShopOrder.find({ userId: user._id }).sort({ createdAt: -1 }).limit(50);
  return rows.map(presentOrder);
}

async function getOrder(user, orderId) {
  const order = await ShopOrder.findOne({ _id: orderId, userId: user._id });
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'That order was not found.');
  return presentOrder(order);
}

async function cancelOrder(user, orderId) {
  return withTransaction(async (session) => {
    const order = await tie(ShopOrder.findOne({ _id: orderId, userId: user._id }), session);
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'That order was not found.');
    if (!['CONFIRMED', 'PROCESSING'].includes(order.status)) {
      throw new ApiError(409, 'CANNOT_CANCEL', 'This order can no longer be cancelled.');
    }
    await restoreStock(order.items, session);
    await referral.reverseForCancelledOrder(order, session);
    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    await order.save(session ? { session } : undefined);
    return presentOrder(order);
  });
}

async function adminList(query) {
  const page = query.page || 1;
  const limit = query.limit || 20;
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  if (query.search) {
    const term = String(query.search).trim().slice(0, 80).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['orderNumber', 'customerName', 'customerPhone', 'customerEmail'].map((field) => ({
      [field]: new RegExp(term, 'i'),
    }));
  }
  const [rows, total] = await Promise.all([
    ShopOrder.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    ShopOrder.countDocuments(filter),
  ]);
  return { items: rows.map(presentOrder), ...pageMeta(page, limit, total) };
}

async function adminGet(orderId) {
  const order = await ShopOrder.findById(orderId);
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'That order was not found.');
  return presentOrder(order);
}

async function adminSetStatus(orderId, status, actor, meta) {
  return withTransaction(async (session) => {
    const order = await tie(ShopOrder.findById(orderId), session);
    if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'That order was not found.');
    if (!NEXT_STATUS[order.status].includes(status)) {
      throw new ApiError(409, 'INVALID_STATUS', `An order that is ${statusLabel(order.status)} cannot move to ${statusLabel(status)}.`);
    }
    const before = order.status;
    if (status === 'CANCELLED') {
      await restoreStock(order.items, session);
      await referral.reverseForCancelledOrder(order, session);
    }
    if (status === 'DELIVERED' && order.paymentMethod === 'COD') order.paymentStatus = 'PAID';
    order.status = status;
    if (status === 'CANCELLED') order.cancelledAt = new Date();
    await order.save(session ? { session } : undefined);
    await recordAudit({
      action: 'ORDER_STATUS',
      resource: 'shop-order',
      resourceId: String(order._id),
      before: { status: before },
      after: { status },
      description: `${order.orderNumber} moved to ${statusLabel(status)}`,
      actorId: actor?.id || '',
      actorName: actor?.name || 'Admin',
      ip: meta?.ip || '',
      userAgent: meta?.userAgent || '',
    });
    return presentOrder(order);
  });
}

async function adminCoupons() {
  await ensureCoupons();
  return (await Coupon.find().sort({ createdAt: 1 })).map(presentCoupon);
}

function normalizeCoupon(input) {
  const type = input.type;
  let value = Number(input.value);
  if (type === 'percent') value = value > 1 ? value / 100 : value;
  if (!Number.isFinite(value) || value < 0) throw new ApiError(400, 'INVALID_COUPON', 'Enter a coupon value.');
  if (type === 'percent' && (value <= 0 || value > 0.9)) {
    throw new ApiError(400, 'INVALID_COUPON', 'A percent coupon must be between 1 and 90.');
  }
  return {
    code: String(input.code || '').trim().toUpperCase(),
    title: input.title,
    subtitle: input.subtitle || '',
    type,
    value,
    minOrder: Number(input.minOrder) || 0,
    maxDiscount: input.maxDiscount == null || input.maxDiscount === '' ? null : Number(input.maxDiscount),
    firstOrderOnly: Boolean(input.firstOrderOnly),
    icon: input.icon || 'pricetag-outline',
    isActive: input.isActive !== false,
  };
}

async function saveCoupon(input, couponId) {
  const payload = normalizeCoupon(input);
  if (!payload.code || !payload.title) throw new ApiError(400, 'INVALID_COUPON', 'A coupon needs a code and a title.');
  if (couponId) {
    const doc = await Coupon.findByIdAndUpdate(couponId, payload, { returnDocument: 'after' });
    if (!doc) throw new ApiError(404, 'COUPON_NOT_FOUND', 'That coupon was not found.');
    return presentCoupon(doc);
  }
  return presentCoupon(await Coupon.create(payload));
}

async function setCouponActive(couponId, isActive) {
  const doc = await Coupon.findByIdAndUpdate(couponId, { isActive }, { returnDocument: 'after' });
  if (!doc) throw new ApiError(404, 'COUPON_NOT_FOUND', 'That coupon was not found.');
  return presentCoupon(doc);
}

function paymentAvailability() {
  return { onlineEnabled: Boolean(gateway()), gateway: gateway() ? 'RAZORPAY' : null };
}

module.exports = {
  getCart, addItem, setQuantity, removeItem, clearCart,
  listAddresses, saveAddress, removeAddress, makeDefault,
  listCoupons, validateCoupon, placeOrder, listOrders, getOrder, cancelOrder,
  moveLegacyAddressesOntoCustomers,
  adminList, adminGet, adminSetStatus, adminCoupons, saveCoupon, setCouponActive,
  paymentAvailability,
};
