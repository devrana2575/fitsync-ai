'use strict';

const AuditLog = require('../models/AuditLog');

// Append a business-activity audit row. Never throws: audit trails are a
// safety net for important operations and must never break the business
// action they accompany.
const logAudit = async ({ actor = null, user = null, action, entity, entityId, before = null, after = null, reason = '', metadata = {} } = {}) => {
  if (!action || !entity || !entityId) return;
  try {
    await AuditLog.create({
      actor,
      user,
      action,
      entity,
      entityId,
      before: before === undefined ? null : before,
      after: after === undefined ? null : after,
      reason: reason || '',
      metadata: metadata || {}
    });
  } catch (error) {
    console.error('[Audit] write failed:', error.message);
  }
};

module.exports = { logAudit };