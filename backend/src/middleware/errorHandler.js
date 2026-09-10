/**
 * GenOS Standardized Error Envelope Middleware
 */

function mapHttpStatus(code, fallbackStatus = 500) {
  const normalizedCode = String(code || '').toUpperCase();
  const mapping = {
    BAD_REQUEST: 400,
    INVALID_ARGUMENT: 400,
    INVALID_INPUT: 400,
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    AUTH_REQUIRED: 401,
    FORBIDDEN: 403,
    PERMISSION_DENIED: 403,
    AGENT_ID_FORBIDDEN: 403,
    ZERO_TRUST_DENIED: 403,
    NOT_FOUND: 404,
    TOOL_NOT_FOUND: 404,
    WORKFLOW_NOT_FOUND: 404,
    AGENT_NOT_FOUND: 404,
    WORKSPACE_NOT_FOUND: 404,
    CONFLICT: 409,
    DUPLICATE_RESOURCE: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    TOOL_LOCKED: 503,
    SERVICE_UNAVAILABLE: 503,
    UNAVAILABLE: 503,
    CIRCUIT_OPEN: 503,
    BLOCKED: 503,
    TIMEOUT: 504
  };

  if (mapping[normalizedCode] !== undefined) return mapping[normalizedCode];
  if (normalizedCode.includes('NOT_FOUND')) return 404;
  if (normalizedCode.includes('INVALID') || normalizedCode.includes('BAD_REQUEST')) return 400;
  if (normalizedCode.includes('UNAUTHORIZED') || normalizedCode.includes('AUTH')) return 401;
  if (normalizedCode.includes('FORBIDDEN') || normalizedCode.includes('PERMISSION')) return 403;
  if (normalizedCode.includes('UNAVAILABLE') || normalizedCode.includes('LOCKED') || normalizedCode.includes('CIRCUIT')) return 503;
  return fallbackStatus;
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const statusCode = Number.isInteger(err.status) ? err.status : mapHttpStatus(err.code, err.statusCode || 500);
  const errorCode = err.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR');
  const message = err.message || 'An unexpected error occurred';
  const details = err.details;
  const store = require('../services/asyncContext').asyncLocalStorage.getStore();
  const requestId = req?.id || store?.get('requestId') || req?.headers?.['x-request-id'] || null;
  const traceId = store?.get('traceId') || req?.headers?.['x-trace-id'] || null;

  if (statusCode === 500) {
    console.error('[GenOS Server Error]', err);
  }

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message,
      ...(requestId ? { requestId } : {}),
      ...(traceId ? { traceId } : {}),
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
