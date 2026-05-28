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
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({
      error: 'Data constraint violation',
      message: 'Invalid data provided'
    });
  }
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({
      error: 'Service unavailable',
      message: 'Database connection failed'
    });
  }
  if (err.name === 'BullMQError') {
    return res.status(500).json({
      error: 'Queue processing error',
      message: 'Failed to process queue operation'
    });
  }
  const statusCode = err.status || err.statusCode || 500;
  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}
function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
}
module.exports = {
  errorHandler,
  notFoundHandler
};