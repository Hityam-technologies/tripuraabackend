const { recordAudit } = require('../services/audit.service');

function actorFrom(req) {
  return {
    actorId: req.admin ? String(req.admin._id) : '',
    actorName: req.admin?.name || 'Admin',
    ip: req.ip || '',
    userAgent: req.get('user-agent') || '',
  };
}

async function writeAudit(req, entry) {
  return recordAudit({ ...actorFrom(req), ...entry });
}

module.exports = { writeAudit, actorFrom };
