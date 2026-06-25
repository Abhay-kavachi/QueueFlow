const { v4: uuidv4 } = require('uuid');

function correlationMiddleware(req, res, next) {
  // Use existing correlation ID if provided, otherwise generate a new one
  req.correlationId = req.headers['x-correlation-id'] || uuidv4();
  
  // Attach it to the response headers for tracing
  res.setHeader('X-Correlation-ID', req.correlationId);
  
  next();
}

module.exports = correlationMiddleware;
