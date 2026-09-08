const circuitBreaker = require('../services/circuitBreaker');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service ControlPlane is alive via gRPC!" }),

  GetCircuitStatus: (call, callback) => {
    const status = circuitBreaker.getStatus('default');
    callback(null, {
      is_open: status.isOpen,
      failures: status.failureCount,
      state: status.state || 'CLOSED'
    });
  },

  TripCircuit: (call, callback) => {
    const { circuit_name, reason } = call.request || {};
    const scope = circuit_name || 'default';
    circuitBreaker.trip(scope, reason || 'manual');
    const status = circuitBreaker.getStatus(scope);
    callback(null, {
      is_open: status.isOpen,
      failures: status.failureCount,
      state: status.state
    });
  }
};
