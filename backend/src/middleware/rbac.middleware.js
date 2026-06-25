const { query } = require('../utils/database');

/**
 * Middleware to enforce Role-Based Access Control (RBAC).
 * It checks if the user's role has the required permission.
 * Assumes req.roleId is already populated by auth.middleware.js.
 */
function requirePermission(requiredPermission) {
  return async (req, res, next) => {
    try {
      const roleId = req.roleId;

      if (!roleId) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'No role assigned to current session'
        });
      }

      // Query database for permissions (in a real system, this should be cached in Redis)
      const result = await query(
        `SELECT 1 FROM role_permissions WHERE role_id = $1 AND permission = $2`,
        [roleId, requiredPermission]
      );

      if (result.rows.length === 0) {
        return res.status(403).json({
          error: 'Forbidden',
          message: `Insufficient permissions. Requires: ${requiredPermission}`
        });
      }

      next();
    } catch (error) {
      console.error('RBAC checking error:', error);
      res.status(500).json({ error: 'Internal server error during authorization' });
    }
  };
}

/**
 * Middleware to enforce State Transition Guards based on Role.
 */
function authorizeTransition(targetState) {
  return async (req, res, next) => {
    try {
      const roleId = req.roleId;
      if (!roleId) return res.status(403).json({ error: 'Access denied' });

      // Example State Machine rules
      const allowedTransitions = {
        'DOCTOR': ['active', 'completed', 'grace'],
        'LAB_TECHNICIAN': ['active', 'completed'],
        'RECEPTIONIST': ['active', 'grace', 'skipped'],
        'ORG_ADMIN': ['active', 'completed', 'grace', 'skipped']
      };

      const allowed = allowedTransitions[roleId] || [];
      if (!allowed.includes(targetState)) {
        return res.status(403).json({
          error: 'Forbidden Transition',
          message: `Role ${roleId} is not allowed to transition queue to ${targetState}`
        });
      }

      // Add to audit trail
      req.auditTransition = targetState;
      next();
    } catch (error) {
      res.status(500).json({ error: 'Transition guard failed' });
    }
  };
}

module.exports = {
  requirePermission,
  authorizeTransition
};
