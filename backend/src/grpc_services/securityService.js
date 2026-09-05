const immuneSystem = require('../services/immuneSystem');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Security is alive via gRPC!" }),

  ScanVulnerabilities: (call, callback) => {
    try {
      const target = call.request?.target || '';
      const scan = immuneSystem.scanThreats(target);
      callback(null, {
        threat_count: scan.threats?.length || 0,
        threats: scan.threats || []
      });
    } catch (err) {
      callback(null, { threat_count: 0, threats: [] });
    }
  },

  TriggerKillSwitch: (call, callback) => {
    immuneSystem.tripKillSwitch(call.request?.reason || 'gRPC emergency stop');
    callback(null, {
      halted: true,
      timestamp: new Date().toISOString()
    });
  }
};
