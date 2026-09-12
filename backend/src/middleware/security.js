/**
 * GenOS Security & Local Enclave Hardening Middleware
 * Origin verification, Double-Submit CSRF, XSS sanitization, and Hardened CSP headers.
 */

const { resolveUserFromHeaders } = require('./auth');

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

const TAG_BLOCK = /<\s*(?:script|iframe|style|object|embed|svg|math)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|iframe|style|object|embed|svg|math)\s*>/gi;
const EVENT_HANDLER = /on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

function stripTagsToFixedPoint(value) {
  let current = value;
  for (let pass = 0; pass < 4; pass += 1) {
    const next = current.replace(/<[^>]*>/g, '');
    if (next === current) break;
    current = next;
  }
  return current;
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Multi-pass stripping defeats mutation XSS such as `<scr<script>ipt>`.
  const withoutBlocks = str.replace(TAG_BLOCK, '');
  return stripTagsToFixedPoint(withoutBlocks)
    .replace(/javascript\s*:/gi, '')
    .replace(EVENT_HANDLER, '')
    .replace(/[<>]/g, '');
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
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
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

function isLocalhostIp(ip) {
  if (ip === '127.0.0.1') return true;
  if (ip === '::1') return true;
  if (ip === '::ffff:127.0.0.1') return true;
  return false;
}

function isBearerRequest(headers) {
  const authorization = String(headers.authorization || '');
  return authorization.toLowerCase().startsWith('bearer ');
}

// Local CLI bypass: loopback without Origin counts only for requests that
// carry a Bearer token which already validated against the access-key
// store (hasValidAuth). Cookie-only localhost callers must still present a
// CSRF token, so a cross-site cookie ride from localhost never bypasses.
function localhostBearerBypass(req, origin, hasValidAuth) {
  if (origin) return false;
  if (!isLocalhostIp(req.ip)) return false;
  if (!isBearerRequest(req.headers)) return false;
  return hasValidAuth;
}

async function csrfCheck(req, res, next) {
  const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!mutatingMethods.includes(req.method)) {
    return next();
  }

  // Exempt auth verification and login from CSRF token requirement if token is in body
  if (req.path.startsWith('/api/auth/verify') || req.path.startsWith('/api/auth/login')) {
    return next();
  }

  // Only a request whose credentials actually validate against the access-key
  // store may bypass the CSRF token check. Merely *carrying* an Authorization
  // header proves nothing: browsers do not attach attacker-chosen headers on
  // cross-site form posts, so a forged header value must never count as auth.
  let hasValidAuth = false;
  if (req.headers.authorization || req.headers['x-access-key']) {
    try {
      hasValidAuth = (await resolveUserFromHeaders(req.headers)).isAuthenticated;
    } catch (_) { hasValidAuth = false; }
  }

  const csrfHeader = String(req.headers['x-csrf-token'] || '');
  const origin = req.headers.origin;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
  const csrfCookie = String(cookies.genos_csrf || '');
  const validDoubleSubmit = csrfHeader.length >= 16 && csrfHeader.length === csrfCookie.length
    && require('crypto').timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(csrfCookie));
  const validIssuedToken = csrfHeader.length >= 16 && isKnownIssuedToken(csrfHeader);

  // CSRF only meaningfully applies to ambient-credential (browser) callers,
  // which always send an Origin. Header-only API clients with no Origin must
  // instead pass authentication (401 otherwise).
  const csrfApplicable = Boolean(origin);
  // Validated access-key callers, double-submit, issued tokens and the local
  // CLI Bearer path are exempt. NODE_ENV is never trusted as an auth signal:
  // a production deployment that sets NODE_ENV=test must not disable CSRF.
  if (!csrfApplicable || validDoubleSubmit || validIssuedToken || hasValidAuth || localhostBearerBypass(req, origin, hasValidAuth)) {
    return next();
  }

  // Reject foreign or untrusted mutating requests
  return res.status(403).json({
    error: { code: 'CSRF_VALIDATION_FAILED', message: 'Anti-CSRF verification failed. Missing X-CSRF-Token or valid Auth credentials.' }
  });
}

// Server-issued anti-CSRF tokens. Only tokens minted by this process are
// accepted, so a forged client-side value can never satisfy validation.
const issuedCsrfTokens = new Map();
const CSRF_TTL_MS = 24 * 60 * 60 * 1000;
const CSRF_MAX_ENTRIES = 1024;

function pruneCsrfTokens(now) {
  for (const [token, expiresAt] of issuedCsrfTokens) {
    if (expiresAt <= now) {
      issuedCsrfTokens.delete(token);
    }
  }
}

function isKnownIssuedToken(token) {
  const now = Date.now();
  pruneCsrfTokens(now);
  const expiresAt = issuedCsrfTokens.get(token);
  if (!expiresAt) {
    return false;
  }
  if (expiresAt <= now) {
    issuedCsrfTokens.delete(token);
    return false;
  }
  return true;
}

function issueCsrfToken(req, res) {
  const token = require('crypto').randomBytes(32).toString('hex');
  const now = Date.now();
  pruneCsrfTokens(now);
  if (issuedCsrfTokens.size >= CSRF_MAX_ENTRIES) {
    const oldestKey = issuedCsrfTokens.keys().next().value;
    issuedCsrfTokens.delete(oldestKey);
  }
  issuedCsrfTokens.set(token, now + CSRF_TTL_MS);

  // SameSite=Lax keeps the value away from cross-site requests; the browser
  // never needs to send it automatically because the Studio echoes the body
  // token back in the X-CSRF-Token header.
  // Only trust X-Forwarded-Proto when an operator explicitly declares the
  // deployment sits behind a trusted reverse proxy.
  const trustProxy = process.env.GENOS_TRUST_PROXY === '1';
  const forwardedProto = trustProxy ? String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() : '';
  const secure = req.secure === true || req.protocol === 'https' || forwardedProto === 'https';
  res.setHeader('Set-Cookie', `genos_csrf=${token}; Path=/; SameSite=Lax${secure ? '; Secure' : ''}`);
  return res.json({ csrfToken: token });
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
  issueCsrfToken,
  xssSanitizer
};
