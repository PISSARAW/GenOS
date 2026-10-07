/**
 * GenOS Standardized Error Envelope Middleware
 */

const HTTP_STATUS_MAP = {
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

const FALLBACK_PATTERNS = [
  { pattern: 'NOT_FOUND', status: 404 },
  { pattern: 'INVALID', status: 400 },
  { pattern: 'BAD_REQUEST', status: 400 },
  { pattern: 'UNAUTHORIZED', status: 401 },
  { pattern: 'AUTH', status: 401 },
  { pattern: 'FORBIDDEN', status: 403 },
  { pattern: 'PERMISSION', status: 403 },
  { pattern: 'UNAVAILABLE', status: 503 },
  { pattern: 'LOCKED', status: 503 },
  { pattern: 'CIRCUIT', status: 503 }
];

function mapHttpStatus(code, fallbackStatus = 500) {
  const normalizedCode = String(code || '').toUpperCase();
  if (HTTP_STATUS_MAP[normalizedCode] !== undefined) return HTTP_STATUS_MAP[normalizedCode];
  for (const { pattern, status } of FALLBACK_PATTERNS) {
    if (normalizedCode.includes(pattern)) return status;
  }
  return fallbackStatus;
}

function extractRequestIds(request) {
  const store = require('../services/asyncContext').asyncLocalStorage.getStore();
  const requestId = request?.id || store?.get('requestId') || request?.headers?.['x-request-id'] || null;
  const traceId = store?.get('traceId') || request?.headers?.['x-trace-id'] || null;
  return { requestId, traceId };
}

function extractErrorInfo(error, statusCode) {
  return {
    errorCode: error.code || (statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'ERROR'),
    message: error.message || 'An unexpected error occurred',
    details: error.details
  };
}

function buildErrorBody({ errorCode, message, requestId, traceId, details }) {
  return {
    error: {
      code: errorCode,
      message,
      ...(requestId ? { requestId } : {}),
      ...(traceId ? { traceId } : {}),
      ...(details ? { details } : {})
    }
  };
}

function buildErrorResponse(error, request) {
  const statusCode = Number.isInteger(error.status) ? error.status : mapHttpStatus(error.code, error.statusCode || 500);
  const { requestId, traceId } = extractRequestIds(request);
  const { errorCode, message, details } = extractErrorInfo(error, statusCode);

  if (statusCode === 500) {
    console.error('[GenOS Server Error]', error);
  }

  return {
    statusCode,
    body: buildErrorBody({ errorCode, message, requestId, traceId, details })
  };
}

function handleError({ error, request, response, next }) {
  if (response.headersSent) {
    return next(error);
  }
  const { statusCode, body } = buildErrorResponse(error, request);
  response.status(statusCode).json(body);
}

// NOTE: Express only routes errors to middleware whose `length` is four.
// Declaring a fourth parameter just for arity would breach the project's
// 3-parameter limit, so the arity is set explicitly: `next` is forwarded
// positionally. Previously this wrapper used rest-args (arity 0) and Express
// silently skipped it, surfacing every thrown error as an HTML page instead
// of the JSON error envelope below.
function errorHandler(error, request, response) {
  return handleError({ error, request, response, next: arguments[3] });
}
Object.defineProperty(errorHandler, 'length', { value: 4 });

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
