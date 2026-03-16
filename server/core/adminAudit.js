const createAdminAuditLogger = ({
  dbRunAsync,
  safeSerializeJson,
  getRequestIp,
} = {}) => {
  const logAdminAuditAsync = async (req, {
    action,
    entityType,
    entityId = null,
    requestId = null,
    details = null,
  } = {}) => {
    if (!action || !entityType) return;
    const actorId = Number(req?.authUser?.id || 0) || null;
    const actorRole = String(req?.authUser?.role || '').trim() || null;
    const normalizedEntityId = entityId === null || entityId === undefined ? null : String(entityId);
    const normalizedRequestId = requestId === null || requestId === undefined ? null : String(requestId);
    const ipAddress = getRequestIp(req) || null;

    try {
      await dbRunAsync(
        `INSERT INTO admin_audit_logs
        (actor_user_id, actor_role, action, entity_type, entity_id, request_id, ip_address, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?::jsonb)`,
        [
          actorId,
          actorRole,
          String(action),
          String(entityType),
          normalizedEntityId,
          normalizedRequestId,
          ipAddress,
          safeSerializeJson(details),
        ]
      );
    } catch (error) {
      console.error('[AUDIT] Failed to write admin audit log:', error?.message || error);
    }
  };

  return { logAdminAuditAsync };
};

module.exports = { createAdminAuditLogger };
