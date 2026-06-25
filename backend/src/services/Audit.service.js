const { query } = require('../utils/database');

class AuditService {
  /**
   * Log an event into the immutable audit_logs table.
   * Note: This method intentionally DOES NOT pass tenantId to the query function 
   * so it executes as the system (to bypass RLS for inserting into audit_logs, 
   * or we can just pass tenantId, but since the policy is INSERT WITH CHECK (true), it works).
   */
  static async logEvent({
    tenantId,
    userId,
    roleId = null,
    action,
    entityType,
    entityId,
    correlationId = null,
    metadata = {},
    ipAddress = null
  }) {
    try {
      if (!tenantId || !userId || !action || !entityType || !entityId) {
        throw new Error('Missing required audit log fields');
      }

      await query(
        `INSERT INTO audit_logs (
          tenant_id, user_id, role_id, action, entity_type, entity_id, correlation_id, metadata, ip_address
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenantId,
          userId,
          roleId,
          action,
          entityType,
          entityId,
          correlationId,
          metadata,
          ipAddress
        ]
      );
      
      console.log(`[AUDIT] ${action} on ${entityType}:${entityId} by ${userId} (${tenantId})`);
    } catch (error) {
      console.error('Audit logging failed:', error);
      // In a real production system, you might want to fail the main transaction
      // if audit logging fails, or queue it to a reliable fallback storage.
      // For now, we just log the error to avoid taking down the request.
    }
  }
}

module.exports = AuditService;
