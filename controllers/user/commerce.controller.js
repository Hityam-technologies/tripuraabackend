const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const commerce = require('../../services/commerce.service');

const cart = asyncHandler(async (req, res) => sendOk(res, await commerce.getCart(req.user)));
const addItem = asyncHandler(async (req, res) => sendOk(res, await commerce.addItem(req.user, req.body.productId, req.body.quantity)));
const setQuantity = asyncHandler(async (req, res) => sendOk(res, await commerce.setQuantity(req.user, req.paramsData.productId, req.body.quantity)));
const removeItem = asyncHandler(async (req, res) => sendOk(res, await commerce.removeItem(req.user, req.paramsData.productId)));
const clear = asyncHandler(async (req, res) => sendOk(res, await commerce.clearCart(req.user)));

const addresses = asyncHandler(async (req, res) => sendOk(res, await commerce.listAddresses(req.user)));
const addAddress = asyncHandler(async (req, res) => sendOk(res, await commerce.saveAddress(req.user, req.body), { status: 201 }));
const editAddress = asyncHandler(async (req, res) => sendOk(res, await commerce.saveAddress(req.user, req.body, req.params.id)));
const deleteAddress = asyncHandler(async (req, res) => sendOk(res, await commerce.removeAddress(req.user, req.params.id)));
const defaultAddress = asyncHandler(async (req, res) => sendOk(res, await commerce.makeDefault(req.user, req.params.id)));

const coupons = asyncHandler(async (_req, res) => sendOk(res, await commerce.listCoupons()));
const validateCoupon = asyncHandler(async (req, res) => sendOk(res, await commerce.validateCoupon(req.user, req.body.code)));

const place = asyncHandler(async (req, res) => sendOk(res, await commerce.placeOrder(req.user, req.body), { status: 201 }));
const orders = asyncHandler(async (req, res) => sendOk(res, await commerce.listOrders(req.user)));
const order = asyncHandler(async (req, res) => sendOk(res, await commerce.getOrder(req.user, req.params.id)));
const cancel = asyncHandler(async (req, res) => sendOk(res, await commerce.cancelOrder(req.user, req.params.id)));
const payments = asyncHandler(async (_req, res) => sendOk(res, commerce.paymentAvailability()));

module.exports = {
  cart, addItem, setQuantity, removeItem, clear,
  addresses, addAddress, editAddress, deleteAddress, defaultAddress,
  coupons, validateCoupon, place, orders, order, cancel, payments,
};
