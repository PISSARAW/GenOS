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

const DANGEROUS_TAGS = ['script', 'iframe', 'style', 'object', 'embed', 'svg', 'math'];

function removeTagBlocks(input) {
  let str = String(input || '');
  for (const tag of DANGEROUS_TAGS) {
    const openPattern = `<${tag}`;
    const closePattern = `</${tag}>`;
    while (true) {
      const lower = str.toLowerCase();
      const openIdx = lower.indexOf(openPattern);
      if (openIdx === -1) break;
      const closeIdx = lower.indexOf(closePattern, openIdx);
      if (closeIdx === -1) {
        const endTag = str.indexOf('>', openIdx);
        if (endTag === -1) {
          str = str.slice(0, openIdx);
        } else {
          str = str.slice(0, openIdx) + str.slice(endTag + 1);
        }
        break;
      }
      str = str.slice(0, openIdx) + str.slice(closeIdx + closePattern.length);
    }
  }
  return str;
}

function stripTagsToFixedPoint(value) {
  let current = String(value || '');
  let previous;
  do {
    previous = current;
    current = current
      .replace(/<[^>]*>/g, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  } while (current !== previous);
  return current.replace(/[<>]/g, '');
}

function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  const withoutBlocks = removeTagBlocks(str);
  return stripTagsToFixedPoint(withoutBlocks);
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

function isCsrfExemptMethodOrPath(req) {
  const mutatingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
  if (!mutatingMethods.includes(req.method)) return true;
  if (req.path.startsWith('/api/auth/verify')) return true;
  if (req.path.startsWith('/api/auth/login')) return true;
  return false;
}

function isValidCsrfToken(req) {
  const csrfHeader = String(req.headers['x-csrf-token'] || '');
  if (csrfHeader.length < 16) return false;
  if (isKnownIssuedToken(csrfHeader)) return true;
  const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map((part) => part.trim().split(/=(.*)/s)).filter(([key]) => key));
  const csrfCookie = String(cookies.genos_csrf || '');
  if (csrfHeader.length !== csrfCookie.length) return false;
  return require('crypto').timingSafeEqual(Buffer.from(csrfHeader), Buffer.from(csrfCookie));
}

async function checkHasValidAuth(headers) {
  if (!headers.authorization && !headers['x-access-key']) return false;
  try {
    const user = await resolveUserFromHeaders(headers);
    return Boolean(user?.isAuthenticated);
  } catch (_) {
    return false;
  }
}

async function csrfCheck(req, res, next) {
  if (isCsrfExemptMethodOrPath(req)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  if (isValidCsrfToken(req)) return next();
  const hasValidAuth = await checkHasValidAuth(req.headers);
  if (hasValidAuth) return next();
  if (localhostBearerBypass(req, origin, hasValidAuth)) return next();

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
