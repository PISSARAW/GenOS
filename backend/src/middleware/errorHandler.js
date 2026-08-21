/**
 * GenOS Standardized Error Envelope Middleware
 */

function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected error occurred';
  const details = err.details || (process.env.NODE_ENV === 'test' ? err.stack : undefined);

  if (statusCode === 500) {
    console.error('[GenOS Server Error]', err);
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      ...(details ? { details } : {})
    }
  });
}

function notFoundHandler(req, res, next) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `Resource not found: ${req.method} ${req.originalUrl}`
    }
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
