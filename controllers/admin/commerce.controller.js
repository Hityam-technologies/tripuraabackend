const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const commerce = require('../../services/commerce.service');

function actor(req) {
  return { id: String(req.admin._id), name: req.admin.name || 'Admin' };
}

function meta(req) {
  return { ip: req.ip || '', userAgent: req.get('user-agent') || '' };
}

const orders = asyncHandler(async (req, res) => sendOk(res, await commerce.adminList(req.queryData)));
const order = asyncHandler(async (req, res) => sendOk(res, await commerce.adminGet(req.params.id)));
const status = asyncHandler(async (req, res) => sendOk(res, await commerce.adminSetStatus(req.params.id, req.body.status, actor(req), meta(req))));
const coupons = asyncHandler(async (_req, res) => sendOk(res, await commerce.adminCoupons()));
const createCoupon = asyncHandler(async (req, res) => sendOk(res, await commerce.saveCoupon(req.body), { status: 201 }));
const updateCoupon = asyncHandler(async (req, res) => sendOk(res, await commerce.saveCoupon(req.body, req.params.id)));
const couponActive = asyncHandler(async (req, res) => sendOk(res, await commerce.setCouponActive(req.params.id, req.body.isActive !== false)));

module.exports = { orders, order, status, coupons, createCoupon, updateCoupon, couponActive };
