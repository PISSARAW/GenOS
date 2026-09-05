const platformSafety = require('../services/platformSafetyService');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Platform is alive via gRPC!" }),

  CheckSafety: (call, callback) => {
    const { action, target } = call.request || {};
    const check = platformSafety.checkAction(action, target);
    callback(null, { allowed: check.allowed !== false, reason: check.reason || '' });
  },

  GetSafetyStatus: (call, callback) => {
    callback(null, { status: 'SECURE', blocked_count: platformSafety.getBlockedCount() || 0 });
  }
};
