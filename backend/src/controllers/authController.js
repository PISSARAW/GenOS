/**
 * GenOS Auth Controller
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { ROLE_PERMISSIONS, resolveUserFromHeaders, hashKey } = require('../middleware/auth');
const { verifyPassword } = require('./password');

async function verifyToken(req, res) {
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
    const rolePerms = ROLE_PERMISSIONS[keyRecord.role] || [];
    let extraPerms = [];
    try {
      const parsed = JSON.parse(keyRecord.permissions || '[]');
      extraPerms = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
    } catch (e) {}

    await db.run('UPDATE access_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?', keyRecord.id);
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
    return res.json({
      valid: true,
      role: session.role,
      permissions: ROLE_PERMISSIONS[session.role] || ROLE_PERMISSIONS.viewer,
      user: { username: session.username, role: session.role, keyId: session.id }
    });
  }

  return res.status(401).json({
    valid: false,
    error: { code: 'INVALID_TOKEN', message: 'Supplied token or access key is invalid or inactive' }
  });
}

async function getSession(req, res) {
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
}

async function login(req, res) {
  const { token, accessKey } = req.body || {};
  const target = token || accessKey;
  if (!target) {
    return res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Token or accessKey is required' } });
  }

  req.body = { token: target };
  return verifyToken(req, res);
}

const SESSION_TTL_HOURS = 24;

async function loginWithPassword(req, res) {
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
  await db.run('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?', user.id);

  return res.json({
    valid: true,
    token: rawToken,
    role: user.role,
    permissions: ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.viewer,
    expiresAtHours: SESSION_TTL_HOURS,
    user: { username: user.username, role: user.role, keyId: id }
  });
}

async function listKeys(req, res) {
  const db = await getDatabase();
  const keys = await db.all('SELECT id, label, role, permissions, created_at, last_used_at, is_active FROM access_keys');
  res.json({ keys });
}

async function createKey(req, res) {
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
  const id = `key-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    'INSERT INTO access_keys (id, key_hash, label, role, permissions, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    id, keyHash, label, role, JSON.stringify(permissions), expiresAt
  );

  res.status(201).json({
    key: { id, label, role, permissions, expiresAt, rawKey }
  });
}

module.exports = {
  verifyToken,
  getSession,
  login,
  loginWithPassword,
  listKeys,
  createKey
};
