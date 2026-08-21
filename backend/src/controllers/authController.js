/**
 * GenOS Auth Controller
 */

const crypto = require('crypto');
const { getDatabase } = require('../db');
const { MILITARY_OVERRIDE_TOKEN, ROLE_PERMISSIONS, resolveUserFromHeaders, hashKey } = require('../middleware/auth');
const telemetry = require('../services/telemetryObserver');

async function verifyToken(req, res) {
  const token = (req.body && req.body.token) || req.headers.authorization || req.headers['x-access-key'];

  if (!token) {
    return res.status(400).json({ error: { code: 'MISSING_TOKEN', message: 'Token is required' } });
  }

  const rawToken = token.startsWith('Bearer ') ? token.slice(7).trim() : token.trim();

  if (rawToken === MILITARY_OVERRIDE_TOKEN) {
    telemetry.emitEvent({
      eventType: 'AUTH_OVERRIDE_VERIFIED',
      agentId: 'auth_service',
      action: 'LOGIN',
      detail: 'Level 5 Military Override Token verified successfully',
      severity: 'warning'
    });
    return res.json({
      valid: true,
      role: 'admin',
      isOverride: true,
      permissions: ROLE_PERMISSIONS.admin,
      user: { username: 'MILITARY_OVERRIDE_ROOT', role: 'admin' }
    });
  }

  const db = await getDatabase();
  const tokenHash = hashKey(rawToken);
  const keyRecord = await db.get(
    'SELECT * FROM access_keys WHERE (key_hash = ? OR id = ?) AND is_active = 1',
    tokenHash, rawToken
  );

  if (keyRecord) {
    const rolePerms = ROLE_PERMISSIONS[keyRecord.role] || [];
    let extraPerms = [];
    try {
      extraPerms = JSON.parse(keyRecord.permissions || '[]');
    } catch (e) {}

    return res.json({
      valid: true,
      role: keyRecord.role,
      permissions: Array.from(new Set([...rolePerms, ...extraPerms])),
      user: { username: keyRecord.label, role: keyRecord.role, keyId: keyRecord.id }
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
      isOverride: !!user.isOverride
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

async function listKeys(req, res) {
  const db = await getDatabase();
  const keys = await db.all('SELECT id, label, role, permissions, created_at, last_used_at, is_active FROM access_keys');
  res.json({ keys });
}

async function createKey(req, res) {
  const { label, role = 'operator', permissions = ['read'] } = req.body || {};
  if (!label) {
    return res.status(400).json({ error: { code: 'INVALID_LABEL', message: 'Key label is required' } });
  }

  const rawKey = `genos_sk_${role}_${crypto.randomBytes(16).toString('hex')}`;
  const keyHash = hashKey(rawKey);
  const id = `key-${Date.now()}`;

  const db = await getDatabase();
  await db.run(
    'INSERT INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
    id, keyHash, label, role, JSON.stringify(permissions)
  );

  res.status(201).json({
    key: { id, label, role, permissions, rawKey }
  });
}

module.exports = {
  verifyToken,
  getSession,
  login,
  listKeys,
  createKey
};
