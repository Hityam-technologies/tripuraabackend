const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const wishlist = require('../../services/wishlist.service');

const list = asyncHandler(async (req, res) => sendOk(res, await wishlist.listWishlist(req.user._id)));
const add = asyncHandler(async (req, res) => sendOk(res, await wishlist.addWishlist(req.user._id, req.params.sareeId), { status: 201 }));
const remove = asyncHandler(async (req, res) => sendOk(res, await wishlist.removeWishlist(req.user._id, req.params.sareeId)));

module.exports = { list, add, remove };
