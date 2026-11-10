const { redact } = require('../utils/format');
const AuditLog = require('../models/AuditLog');
const { pageMeta } = require('../utils/pagination');

async function recordAudit(entry) {
  return AuditLog.create({
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId || '',
    before: entry.before ? redact(entry.before) : null,
    after: entry.after ? redact(entry.after) : null,
    description: entry.description || '',
    actorId: entry.actorId || '',
    actorName: entry.actorName || 'Admin',
    ip: entry.ip || '',
    userAgent: entry.userAgent || '',
  });
}

function present(log) {
  return {
    id: String(log._id),
    actor: { id: log.actorId, name: log.actorName },
    actorName: log.actorName,
    action: log.action,
    resource: log.resource,
    resourceId: log.resourceId,
    description: log.description,
    ipAddress: log.ip,
    userAgent: log.userAgent,
    timestamp: log.createdAt,
    before: log.before,
    after: log.after,
  };
}

async function listAuditLogs(query) {
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.resource) filter.resource = query.resource;
  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(query.startDate);
    if (query.endDate) filter.createdAt.$lte = new Date(query.endDate);
  }
  const skip = (query.page - 1) * query.limit;
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  const meta = pageMeta(query.page, query.limit, total);
  return { items: rows.map(present), ...meta };
}

module.exports = { recordAudit, listAuditLogs };
