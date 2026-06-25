const AuthService = require('../services/Auth.service');
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Missing or invalid authorization header'
    });
  }
  const token = authHeader.substring(7); 
  AuthService.verifySession(token)
    .then(verificationResult => {
      if (!verificationResult.valid) {
        return res.status(401).json({
          error: 'Invalid session',
          message: verificationResult.error
        });
      }
      req.user = {
        userHash: verificationResult.userHash,
        sessionId: verificationResult.sessionId
      };
      req.tenantId = verificationResult.tenantId;
      req.roleId = verificationResult.roleId;
      next();
    })
    .catch(error => {
      console.error('Authentication middleware error:', error);
      return res.status(500).json({
        error: 'Authentication failed',
        message: 'Internal server error during authentication'
      });
    });
}
function authenticateStaff(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Staff authentication required',
      message: 'Missing or invalid authorization header'
    });
  }
  const token = authHeader.substring(7);
  AuthService.verifyAdminToken(token)
    .then(verificationResult => {
      if (!verificationResult.valid) {
        return res.status(401).json({
          error: 'Invalid staff token',
          message: verificationResult.error
        });
      }
      req.staff = verificationResult.admin;
      req.tenantId = verificationResult.admin.organizationId;
      req.roleId = verificationResult.admin.role;
      next();
    })
    .catch(error => {
      console.error('Staff authentication middleware error:', error);
      return res.status(500).json({
        error: 'Staff authentication failed',
        message: 'Internal server error during staff authentication'
      });
    });
}
function authenticateWorker(req, res, next) {
  const workerToken = req.headers['x-worker-token'];
  if (!workerToken) {
    return res.status(401).json({
      error: 'Worker authentication required',
      message: 'Missing worker token'
    });
  }
  AuthService.verifyAdminToken(workerToken)
    .then(verificationResult => {
      if (!verificationResult.valid) {
        return res.status(401).json({
          error: 'Invalid worker token',
          message: verificationResult.error
        });
      }
      if (verificationResult.admin.role !== 'worker' && verificationResult.admin.role !== 'admin') {
        return res.status(403).json({
          error: 'Insufficient permissions',
          message: 'Worker role required'
        });
      }
      req.worker = verificationResult.admin;
      req.tenantId = verificationResult.admin.organizationId;
      req.roleId = verificationResult.admin.role;
      next();
    })
    .catch(error => {
      console.error('Worker authentication middleware error:', error);
      return res.status(500).json({
        error: 'Worker authentication failed',
        message: 'Internal server error during worker authentication'
      });
    });
}
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'Invalid JSON',
      message: 'Request body contains invalid JSON'
    });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload too large',
      message: 'Request payload exceeds size limit'
    });
  }
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
function validateRequest(validationSchema) {
  return (req, res, next) => {
    const { error, value } = validationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    req.validatedBody = value;
    next();
  };
}
const rateLimitStore = new Map();
function rateLimit(maxRequests = 100, windowMs = 15 * 60 * 1000) {
  return (req, res, next) => {
    const clientId = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    if (!rateLimitStore.has(clientId)) {
      rateLimitStore.set(clientId, {
        requests: [],
        windowStart: now
      });
    }
    const clientData = rateLimitStore.get(clientId);
    clientData.requests = clientData.requests.filter(timestamp => 
      now - timestamp < windowMs
    );
    if (now - clientData.windowStart >= windowMs) {
      clientData.requests = [];
      clientData.windowStart = now;
    }
    if (clientData.requests.length >= maxRequests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs/60000} minutes`
      });
    }
    clientData.requests.push(now);
    next();
  };
}
module.exports = {
  authenticateUser,
  authenticateStaff,
  authenticateWorker,
  errorHandler,
  validateRequest,
  rateLimit
};