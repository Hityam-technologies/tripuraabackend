const { asyncHandler } = require('../utils/asyncHandler');
const { sendOk } = require('../utils/ApiError');
const billing = require('../services/billing.service');

function meta(req) {
  return { ip: req.ip || '', userAgent: req.get('user-agent') || '' };
}

const pin = asyncHandler(async (req, res) => {
  const result = await billing.verifyPin(req.body.pin, meta(req));
  sendOk(res, result);
});

const logout = asyncHandler(async (req, res) => {
  await billing.logout(req.billingStaff, req.auth.jti, meta(req));
  sendOk(res, { locked: true });
});

const me = asyncHandler(async (req, res) => {
  sendOk(res, { staff: billing.presentStaff(req.billingStaff) });
});

const settings = asyncHandler(async (_req, res) => {
  sendOk(res, await billing.gstSettings());
});

const services = asyncHandler(async (_req, res) => {
  sendOk(res, { services: await billing.listServices() });
});

const products = asyncHandler(async (req, res) => {
  sendOk(res, { products: await billing.searchProducts(req.queryData) });
});

const categories = asyncHandler(async (_req, res) => {
  sendOk(res, { categories: await billing.listCategories() });
});

const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await billing.createInvoice(req.body, req.billingStaff, meta(req));
  sendOk(res, { invoice });
});

const invoices = asyncHandler(async (req, res) => {
  sendOk(res, await billing.listInvoices(req.queryData));
});

const invoice = asyncHandler(async (req, res) => {
  sendOk(res, { invoice: await billing.getInvoice(req.params.id) });
});

const returnInvoice = asyncHandler(async (req, res) => {
  const invoice = await billing.processReturn(req.params.id, req.body.reason, req.billingStaff, meta(req));
  sendOk(res, { invoice });
});

const whatsapp = asyncHandler(async (req, res) => {
  sendOk(res, await billing.markWhatsAppShared(req.params.id));
});

const held = asyncHandler(async (req, res) => {
  sendOk(res, { heldBills: await billing.listHeld(req.billingStaff) });
});

const hold = asyncHandler(async (req, res) => {
  sendOk(res, { heldBill: await billing.holdBill(req.body, req.billingStaff) });
});

const resume = asyncHandler(async (req, res) => {
  sendOk(res, { heldBill: await billing.resumeHeld(req.params.id, req.billingStaff) });
});

const discard = asyncHandler(async (req, res) => {
  await billing.discardHeld(req.params.id, req.billingStaff);
  sendOk(res, { discarded: true });
});

const soldOut = asyncHandler(async (req, res) => {
  sendOk(res, { products: await billing.soldOutProducts(req.queryData) });
});

const restock = asyncHandler(async (req, res) => {
  sendOk(res, await billing.restockProduct(req.params.id, req.body.quantity, req.billingStaff));
});

const customers = asyncHandler(async (req, res) => {
  sendOk(res, { customers: await billing.listCustomers(req.queryData.search) });
});

const lookup = asyncHandler(async (req, res) => {
  sendOk(res, await billing.lookupCustomer(req.queryData.phone));
});

const createCustomer = asyncHandler(async (req, res) => {
  sendOk(res, { customer: await billing.createCustomer(req.body) });
});

const summary = asyncHandler(async (req, res) => {
  sendOk(res, await billing.todaySummary(req.billingStaff));
});

const adminCreateStaff = asyncHandler(async (req, res) => {
  sendOk(res, { staff: await billing.createStaff(req.body) }, { status: 201 });
});

const adminListStaff = asyncHandler(async (_req, res) => {
  sendOk(res, { staff: await billing.listStaff() });
});

module.exports = {
  pin, logout, me, settings, services, products, categories,
  createInvoice, invoices, invoice, returnInvoice, whatsapp,
  held, hold, resume, discard, soldOut, restock,
  customers, lookup, createCustomer, summary,
  adminCreateStaff, adminListStaff,
};
