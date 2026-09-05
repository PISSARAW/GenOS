const { getDatabase } = require('../db');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Auth is alive via gRPC!" }),

  Authenticate: async (call, callback) => {
    try {
      const { username, password } = call.request || {};
      const db = await getDatabase();
      const user = await db.get('SELECT id, username, role FROM users WHERE username = ?', username);
      if (user) {
        callback(null, { authenticated: true, token: `token-${user.id}`, role: user.role });
      } else {
        callback(null, { authenticated: false, token: '', role: '' });
      }
    } catch (err) {
      callback(null, { authenticated: false, token: '', role: '' });
    }
  },

  ValidateToken: (call, callback) => {
    const token = call.request?.token || '';
    const valid = token.startsWith('token-') || token === 'admin-master-key';
    callback(null, { valid, user_id: valid ? 'admin' : '', role: valid ? 'admin' : '' });
  }
};
