const circuitBreaker = require('../services/circuitBreaker');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service ControlPlane is alive via gRPC!" }),

  GetCircuitStatus: (call, callback) => {
    const status = circuitBreaker.getStatus('default');
    callback(null, {
      is_open: status.isOpen || false,
      failures: status.failures || 0,
      state: status.state || 'CLOSED'
    });
  },

  TripCircuit: (call, callback) => {
    const { circuit_name, reason } = call.request || {};
    circuitBreaker.trip(circuit_name || 'default', reason || 'manual');
    callback(null, {
      is_open: true,
      failures: 5,
      state: 'OPEN'
    });
  }
};
