/**
 * GenOS Auth Controller
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { ROLE_PERMISSIONS, resolveUserFromHeaders, hashKey } = require('../middleware/auth');
const { verifyPassword } = require('./password');
const telemetry = require('../services/telemetryObserver');
const verifyAttempts = new Map();
const VERIFY_WINDOW_MS = 60 * 1000;
const VERIFY_LIMIT = 20;

function verifyRateLimit(req) {
  const key = String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  const now = Date.now();
  if (verifyAttempts.size > 200) {
    for (const [k, v] of verifyAttempts.entries()) {
      if (now - v.startedAt >= VERIFY_WINDOW_MS) {
        verifyAttempts.delete(k);
      }
    }
  }
  const entry = verifyAttempts.get(key);
  if (!entry || now - entry.startedAt >= VERIFY_WINDOW_MS) {
    verifyAttempts.set(key, { startedAt: now, count: 1 });
    return null;
  }
  entry.count += 1;
  if (entry.count > VERIFY_LIMIT) return Math.max(1, Math.ceil((VERIFY_WINDOW_MS - (now - entry.startedAt)) / 1000));
  return null;
}

async function verifyToken(req, res, next) {
  try {
    const retryAfter = verifyRateLimit(req);
    if (retryAfter) {
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: { code: 'AUTH_RATE_LIMITED', message: 'Too many token verification attempts.' } });
    }
    const token = (req.body && req.body.token) || req.headers.authorization || req.headers['x-access-key'];

    if (!token) {
      return res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'Token is required' } });
    }

    const rawToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();

    const db = await getDatabase();
    const tokenHash = hashKey(rawToken);
    const keyRecord = await db.get(
      `SELECT * FROM access_keys
       WHERE key_hash = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      tokenHash
    );

    if (keyRecord) {
      verifyAttempts.delete(String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim());
      const rolePerms = ROLE_PERMISSIONS[keyRecord.role] || [];
      let extraPerms = [];
      try {
        const parsed = JSON.parse(keyRecord.permissions || '[]');
        extraPerms = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
      } catch (e) {}

      await db.run('UPDATE access_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', keyRecord.id);
      telemetry.emitEvent({ eventType: 'AUTH_TOKEN_VERIFIED', action: 'AUTH', detail: 'Access key verified.', payload: { principalId: keyRecord.id, kind: 'access_key' } });
      return res.json({
        valid: true,
        role: keyRecord.role,
        permissions: Array.from(new Set([...rolePerms, ...extraPerms])),
        user: { username: keyRecord.label, role: keyRecord.role, keyId: keyRecord.id }
      });
    }

    const session = await db.get(
      'SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0 AND expires_at > CURRENT_TIMESTAMP',
      tokenHash
    );
    if (session) {
      telemetry.emitEvent({ eventType: 'AUTH_TOKEN_VERIFIED', action: 'AUTH', detail: 'Session verified.', payload: { principalId: session.id, kind: 'session' } });
      verifyAttempts.delete(String(req.ip || req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim());
      return res.json({
        valid: true,
        role: session.role,
        permissions: ROLE_PERMISSIONS[session.role] || ROLE_PERMISSIONS.viewer,
        user: { username: session.username, role: session.role, keyId: session.id }
      });
    }

    telemetry.emitEvent({ eventType: 'AUTH_TOKEN_REJECTED', action: 'AUTH', detail: 'Invalid credential rejected.', severity: 'warning', payload: { ip: req.ip || null } });
    return res.status(401).json({
      valid: false,
      error: { code: 'INVALID_TOKEN', message: 'Supplied token or access key is invalid or inactive' }
    });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

async function getSession(req, res, next) {
  try {
    const user = await resolveUserFromHeaders(req.headers);
    res.json({
      user: {
        username: user.username,
        role: user.role,
        permissions: user.permissions,
        isAuthenticated: user.isAuthenticated,
        isBootstrap: false
      }
    });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

async function login(req, res, next) {
  try {
    const { token, accessKey } = req.body || {};
    const target = token || accessKey;
    if (!target) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Token or accessKey is required' } });
    }

    req.body = { token: target };
    return verifyToken(req, res, next);
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

const SESSION_TTL_HOURS = 24;

async function loginWithPassword(req, res, next) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'username and password are required' } });
    }

    const db = await getDatabase();
    const user = await db.get(
      'SELECT * FROM users WHERE username = ? COLLATE NOCASE AND is_active = 1',
      String(username).trim()
    );
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' } });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const id = `session-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    await db.run(
      `INSERT INTO sessions (id, token_hash, role, username, expires_at)
       VALUES (?, ?, ?, ?, datetime('now', '+${SESSION_TTL_HOURS} hours'))`,
      id, hashKey(rawToken), user.role, user.username
    );
    telemetry.emitEvent({
      eventType: 'AUTH_KEY_CREATED',
      action: 'CREDENTIAL',
      detail: `Session ${id} created for ${user.username}.`,
      payload: { principalId: id, role: user.role, label: `Session for ${user.username}` }
    });
    await db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', user.id);

    return res.json({
      valid: true,
      token: rawToken,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.viewer,
      expiresAtHours: SESSION_TTL_HOURS,
      user: { username: user.username, role: user.role, keyId: id }
    });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

async function listKeys(req, res, next) {
  try {
    const db = await getDatabase();
    const keys = await db.all('SELECT id, label, role, permissions, created_at, last_used_at, is_active FROM access_keys');
    res.json({ keys });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

async function createKey(req, res, next) {
  try {
    const { label, role = 'operator', permissions = ['read'], expiresAt = null } = req.body || {};
    if (!label) {
      return res.status(400).json({ error: { code: 'INVALID_LABEL', message: 'Key label is required' } });
    }
    if (!Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)) {
      return res.status(400).json({ error: { code: 'INVALID_ROLE', message: 'role must be admin, operator, or viewer' } });
    }
    if (!Array.isArray(permissions) || permissions.some((permission) => typeof permission !== 'string')) {
      return res.status(400).json({ error: { code: 'INVALID_PERMISSIONS', message: 'permissions must be an array of strings' } });
    }
    if (expiresAt != null && Number.isNaN(Date.parse(expiresAt))) {
      return res.status(400).json({ error: { code: 'INVALID_EXPIRY', message: 'expiresAt must be a valid date' } });
    }

    const rawKey = `genos_sk_${role}_${crypto.randomBytes(16).toString('hex')}`;
    const keyHash = hashKey(rawKey);
    const id = `key-${crypto.randomUUID()}`;

    const db = await getDatabase();
    await db.run(
      'INSERT INTO access_keys (id, key_hash, label, role, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, keyHash, label, role, JSON.stringify(permissions), expiresAt
    );

    res.status(201).json({
      key: { id, label, role, permissions, expiresAt, rawKey }
    });
  } catch (error) {
    if (next) return next(error);
    throw error;
  }
}

async function revokeKey(req, res, next) {
  try {
    const db = await getDatabase();
    const result = await db.run('UPDATE access_keys SET is_active = 0 WHERE id = ? AND is_active = 1', req.params.id);
    if (result.changes !== 1) return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'Active access key not found.' } });
    telemetry.emitEvent({ eventType: 'AUTH_KEY_REVOKED', action: 'CREDENTIAL', detail: `Access key ${req.params.id} revoked.`, payload: { principalId: req.params.id } });
    res.json({ success: true, id: req.params.id, revoked: true });
  } catch (error) { next(error); }
}

async function rotateKey(req, res, next) {
  try {
    const db = await getDatabase();
    const existing = await db.get('SELECT label, role, permissions, expires_at FROM access_keys WHERE id = ? AND is_active = 1', req.params.id);
    if (!existing) return res.status(404).json({ error: { code: 'KEY_NOT_FOUND', message: 'Active access key not found.' } });
    const rawKey = `genos_sk_${existing.role}_${crypto.randomBytes(16).toString('hex')}`;
    const id = `key-${crypto.randomUUID()}`;
    await db.run('UPDATE access_keys SET is_active = 0 WHERE id = ?', req.params.id);
    await db.run('INSERT INTO access_keys (id, key_hash, label, role, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?)', id, hashKey(rawKey), existing.label, existing.role, existing.permissions, existing.expires_at);
    telemetry.emitEvent({ eventType: 'AUTH_KEY_ROTATED', action: 'CREDENTIAL', detail: `Access key ${req.params.id} rotated.`, payload: { principalId: id, rotatedFrom: req.params.id } });
    res.status(201).json({ key: { id, label: existing.label, role: existing.role, permissions: JSON.parse(existing.permissions || '[]'), expiresAt: existing.expires_at, rawKey }, rotatedFrom: req.params.id });
  } catch (error) { next(error); }
}

async function revokeSession(req, res, next) {
  try {
    const db = await getDatabase();
    const result = await db.run('UPDATE sessions SET revoked = 1 WHERE id = ? AND revoked = 0', req.params.id);
    if (result.changes !== 1) return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Active session not found.' } });
    telemetry.emitEvent({ eventType: 'AUTH_SESSION_REVOKED', action: 'CREDENTIAL', detail: `Session ${req.params.id} revoked.`, payload: { principalId: req.params.id } });
    res.json({ success: true, id: req.params.id, revoked: true });
  } catch (error) { next(error); }
}

module.exports = {
  verifyToken,
  getSession,
  login,
  loginWithPassword,
  listKeys,
  createKey,
  revokeKey,
  rotateKey,
  revokeSession
};
