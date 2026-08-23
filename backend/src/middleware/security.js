/**
 * GenOS Security & Local Enclave Hardening Middleware
 * Origin verification, Double-Submit CSRF, XSS sanitization, and Hardened CSP headers.
 */

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:4000',
  'http://localhost:5173',
  'http://localhost:5175',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5175'
];

const configuredOrigins = String(process.env.GENOS_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = Array.from(new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]));

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*script\b[^>]*>/gi, '')
    .replace(/<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*iframe\b[^>]*>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
    .replace(/<\s*iframe\b[^>]*>/gi, '')
    .replace(/<\s*\/\s*iframe\s*>/gi, '')
    .replace(/javascript\s*:[^\s"'>]*/gi, '')
    .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function sanitizeValue(val) {
  if (typeof val === 'string') {
    return sanitizeString(val);
  }
  if (Array.isArray(val)) {
    return val.map(item => sanitizeValue(item));
  }
  if (val && typeof val === 'object') {
    const sanitized = {};
    for (const key of Object.keys(val)) {
      sanitized[key] = sanitizeValue(val[key]);
    }
    return sanitized;
  }
  return val;
}

function sanitizeObject(obj) {
  return sanitizeValue(obj);
}


function securityHeaders(req, res, next) {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

function originCheck(req, res, next) {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      error: { code: 'FORBIDDEN_ORIGIN', message: `Untrusted cross-origin request rejected: ${origin}` }
    });
  }
  next();
}

function csrfCheck(req, res, next) {
  const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Exempt auth verification and login from CSRF token requirement if token is in body
  if (req.path.startsWith('/api/auth/verify') || req.path.startsWith('/api/auth/login')) {
    return next();
  }

  const csrfHeader = String(req.headers['x-csrf-token'] || '');
  const hasAuth = req.headers.authorization || req.headers['x-access-key'];
  const origin = req.headers.origin;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
  const csrfCookie = String(cookies.genos_csrf || '');
  const validDoubleSubmit = csrfHeader.length >= 16 && csrfHeader.length === csrfCookie.length
    && require('crypto').timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(csrfCookie));

  // Local CLI, direct curl, or valid token/CSRF
  if (validDoubleSubmit || hasAuth || (!origin && req.ip === '127.0.0.1') || (!origin && req.ip === '::1')) {
    return next();
  }

  // Reject foreign or untrusted mutating requests
  return res.status(403).json({
    error: { code: 'CSRF_VALIDATION_FAILED', message: 'Anti-CSRF verification failed. Missing X-CSRF-Token or Auth header.' }
  });
}

function xssSanitizer(req, res, next) {
  // JSON payloads contain source code, prompts and templates where mutation is
  // data corruption. HTML escaping belongs at the rendering boundary.
  next();
}

module.exports = {
  ALLOWED_ORIGINS,
  sanitizeString,
  sanitizeValue,
  sanitizeObject,
  securityHeaders,
  originCheck,
  csrfCheck,
  xssSanitizer
};
