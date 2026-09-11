const { getDatabase } = require('../db');
const crypto = require('crypto');
const { verifyPassword, hashKey } = require('../controllers/password');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Auth is alive via gRPC!" }),

  Authenticate: async (call, callback) => {
    try {
      const { username, password } = call.request || {};
      const db = await getDatabase();
      const user = await db.get('SELECT id, username, password_hash, role FROM users WHERE username = ?', username);
      if (user && verifyPassword(password, user.password_hash)) {
        const token = `grpc-${crypto.randomBytes(32).toString('base64url')}`;
        await db.run(
          'INSERT INTO access_keys (id, key_hash, label, role, permissions) VALUES (?, ?, ?, ?, ?)',
          `grpc-${crypto.randomUUID()}`, hashKey(token), `grpc:${user.username}`, user.role, '[]'
        );
        callback(null, { authenticated: true, token, role: user.role });
      } else {
        callback(null, { authenticated: false, token: '', role: '' });
      }
    } catch (err) {
      callback(null, { authenticated: false, token: '', role: '' });
    }
  },

  ValidateToken: async (call, callback) => {
    try {
      const token = String(call.request?.token || '');
      const db = await getDatabase();
      const record = await db.get(
        `SELECT id, role FROM access_keys WHERE key_hash = ? AND is_active = 1
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        hashKey(token)
      );
      callback(null, { valid: Boolean(record), user_id: record?.id || '', role: record?.role || '' });
    } catch (_) {
      callback(null, { valid: false, user_id: '', role: '' });
    }
  }
};
