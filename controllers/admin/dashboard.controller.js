const { asyncHandler } = require('../../utils/asyncHandler');
const { sendOk } = require('../../utils/ApiError');
const { writeAudit } = require('../../middleware/audit');
const dashboard = require('../../services/dashboard.service');
const catalog = require('../../services/catalog.service');
const enquiries = require('../../services/enquiry.service');
const users = require('../../services/user.service');
const content = require('../../services/content.service');
const system = require('../../services/systemConfig.service');
const tryOn = require('../../services/tryon/tryOn.service');
const auditLogs = require('../../services/audit.service');

const stats = asyncHandler(async (_req, res) => sendOk(res, await dashboard.stats()));

const listSarees = asyncHandler(async (req, res) => sendOk(res, await catalog.adminList(req.queryData)));
const getSaree = asyncHandler(async (req, res) => sendOk(res, await catalog.adminGet(req.params.id)));
const createSaree = asyncHandler(async (req, res) => {
  const created = await catalog.createSaree(req.body);
  await writeAudit(req, { action: 'CREATE_SAREE', resource: 'saree', resourceId: created.id, after: created, description: `Created ${created.title}` });
  sendOk(res, created, { status: 201 });
});
const updateSaree = asyncHandler(async (req, res) => {
  const result = await catalog.updateSaree(req.params.id, req.body);
  await writeAudit(req, { action: 'UPDATE_SAREE', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const deleteSaree = asyncHandler(async (req, res) => {
  const result = await catalog.softDelete(req.params.id);
  await writeAudit(req, { action: 'DELETE_SAREE', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const duplicateSaree = asyncHandler(async (req, res) => {
  const created = await catalog.duplicateSaree(req.params.id);
  await writeAudit(req, { action: 'DUPLICATE_SAREE', resource: 'saree', resourceId: created.id, after: created });
  sendOk(res, created, { status: 201 });
});
const bulkSarees = asyncHandler(async (req, res) => {
  const result = await catalog.bulkSarees(req.body);
  await writeAudit(req, { action: 'BULK_SAREES', resource: 'saree', after: result, description: req.body.action });
  sendOk(res, result);
});
const addImages = asyncHandler(async (req, res) => {
  const result = await catalog.addImages(req.params.id, req.preparedImages);
  await writeAudit(req, { action: 'ADD_SAREE_IMAGES', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const addImageUrls = asyncHandler(async (req, res) => {
  const result = await catalog.addImageUrls(req.params.id, req.body.urls);
  await writeAudit(req, { action: 'ADD_SAREE_IMAGE_URLS', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const reorderImages = asyncHandler(async (req, res) => {
  const result = await catalog.reorderImages(req.params.id, req.body.order);
  await writeAudit(req, { action: 'REORDER_SAREE_IMAGES', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const deleteImage = asyncHandler(async (req, res) => {
  const result = await catalog.deleteImage(req.params.id, req.params.imageId);
  await writeAudit(req, { action: 'DELETE_SAREE_IMAGE', resource: 'saree', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});

const listCategories = asyncHandler(async (_req, res) => sendOk(res, await catalog.listCategories(false)));
const createCategory = asyncHandler(async (req, res) => {
  const id = req.body.id || req.body.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const created = await catalog.createCategory({ ...req.body, id });
  await writeAudit(req, { action: 'CREATE_CATEGORY', resource: 'category', resourceId: created.id, after: created });
  sendOk(res, created, { status: 201 });
});
const updateCategory = asyncHandler(async (req, res) => {
  const result = await catalog.updateCategory(req.params.id, req.body);
  await writeAudit(req, { action: 'UPDATE_CATEGORY', resource: 'category', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const deleteCategory = asyncHandler(async (req, res) => {
  const result = await catalog.deleteCategory(req.params.id, req.body?.reassignTo || req.query.reassignTo);
  await writeAudit(req, { action: 'DELETE_CATEGORY', resource: 'category', resourceId: req.params.id, after: result });
  sendOk(res, result);
});
const reorderCategories = asyncHandler(async (req, res) => {
  const result = await catalog.reorderCategories(req.body.order);
  await writeAudit(req, { action: 'REORDER_CATEGORIES', resource: 'category', after: result });
  sendOk(res, result);
});

const listEnquiries = asyncHandler(async (req, res) => sendOk(res, await enquiries.adminList(req.queryData)));
const getEnquiry = asyncHandler(async (req, res) => sendOk(res, await enquiries.adminGet(req.params.id)));
const enquiryStatus = asyncHandler(async (req, res) => {
  const result = await enquiries.updateStatus(req.params.id, req.body.status, req.admin.name);
  await writeAudit(req, { action: 'UPDATE_ENQUIRY_STATUS', resource: 'enquiry', resourceId: req.params.id, before: { status: result.before }, after: result.after });
  sendOk(res, result.after);
});
const enquiryNote = asyncHandler(async (req, res) => {
  const result = await enquiries.addNote(req.params.id, req.body.text, req.admin.name);
  await writeAudit(req, { action: 'ADD_ENQUIRY_NOTE', resource: 'enquiry', resourceId: req.params.id, after: result.note });
  sendOk(res, result.note, { status: 201 });
});
const exportEnquiries = asyncHandler(async (req, res) => {
  const result = await enquiries.exportCsv();
  await writeAudit(req, { action: 'EXPORT_ENQUIRIES', resource: 'enquiry', description: 'Exported enquiry CSV' });
  sendOk(res, result);
});

const listUsers = asyncHandler(async (req, res) => sendOk(res, await users.adminList(req.queryData)));
const getUser = asyncHandler(async (req, res) => sendOk(res, await users.adminGet(req.params.id)));
const blockUser = asyncHandler(async (req, res) => {
  const blocked = req.body.isBlocked !== false;
  const result = await users.setBlocked(req.params.id, blocked, req.body.reason);
  await writeAudit(req, { action: blocked ? 'BLOCK_USER' : 'UNBLOCK_USER', resource: 'user', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const unblockUser = asyncHandler(async (req, res) => {
  const result = await users.setBlocked(req.params.id, false, '');
  await writeAudit(req, { action: 'UNBLOCK_USER', resource: 'user', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});

const looks = asyncHandler(async (req, res) => sendOk(res, await tryOn.adminLooks(req.queryData || { page: 1, limit: 20 })));
const flagLook = asyncHandler(async (req, res) => {
  const result = await tryOn.flagLook(req.params.id, req.body);
  await writeAudit(req, { action: 'FLAG_LOOK', resource: 'look', resourceId: req.params.id, before: result.before, after: result.after });
  sendOk(res, result.after);
});
const deleteLook = asyncHandler(async (req, res) => {
  const result = await tryOn.removeLookAdmin(req.params.id);
  await writeAudit(req, { action: 'DELETE_LOOK', resource: 'look', resourceId: req.params.id, after: result });
  sendOk(res, result);
});
const jobs = asyncHandler(async (req, res) => sendOk(res, await tryOn.adminJobs(req.queryData)));
const credits = asyncHandler(async (_req, res) => sendOk(res, await tryOn.creditsSummary()));

async function saveContent(req, res, key, data) {
  const result = await content.write(key, data);
  await writeAudit(req, { action: 'UPDATE_CONTENT', resource: 'content', resourceId: key, before: result.before, after: result.after });
  sendOk(res, result.after);
}

const getHero = asyncHandler(async (_req, res) => sendOk(res, await content.hero()));
const putHero = asyncHandler(async (req, res) => saveContent(req, res, 'hero', req.body));
const getStore = asyncHandler(async (_req, res) => sendOk(res, await content.storeAddress()));
const putStore = asyncHandler(async (req, res) => saveContent(req, res, 'store', req.body));
const getSupport = asyncHandler(async (_req, res) => sendOk(res, { channels: await content.supportChannels() }));
const putSupport = asyncHandler(async (req, res) => saveContent(req, res, 'support', req.body));
const getFaq = asyncHandler(async (_req, res) => sendOk(res, { items: await content.faq() }));
const putFaq = asyncHandler(async (req, res) => saveContent(req, res, 'faq', req.body));
const getLegal = asyncHandler(async (req, res) => sendOk(res, await content.legal(req.params.slug || req.params.type)));
const putLegal = asyncHandler(async (req, res) => {
  const slug = req.params.slug || req.params.type;
  // Merge so admin section edits do not wipe intro / tryOnConsent / contact fields
  let existing = null;
  try {
    existing = await content.legal(slug);
  } catch {
    existing = {};
  }
  const data = {
    ...existing,
    ...req.body,
    updatedAt: new Date().toISOString(),
  };
  await saveContent(req, res, `legal-${slug}`, data);
});

const getSystem = asyncHandler(async (_req, res) => sendOk(res, await system.getPublicConfig()));
const putSystem = asyncHandler(async (req, res) => {
  const result = await system.updateConfig(req.body, req.admin);
  await writeAudit(req, { action: 'UPDATE_SYSTEM_CONFIG', resource: 'system-config', before: result.before, after: result.after });
  sendOk(res, result.after);
});

const listAudit = asyncHandler(async (req, res) => sendOk(res, await auditLogs.listAuditLogs(req.queryData)));

module.exports = {
  stats,
  listSarees, getSaree, createSaree, updateSaree, deleteSaree, duplicateSaree, bulkSarees, addImages, addImageUrls, reorderImages, deleteImage,
  listCategories, createCategory, updateCategory, deleteCategory, reorderCategories,
  listEnquiries, getEnquiry, enquiryStatus, enquiryNote, exportEnquiries,
  listUsers, getUser, blockUser, unblockUser,
  looks, flagLook, deleteLook, jobs, credits,
  getHero, putHero, getStore, putStore, getSupport, putSupport, getFaq, putFaq, getLegal, putLegal,
  getSystem, putSystem, listAudit,
};
