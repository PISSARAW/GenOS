/**
 * GenOS Security & Emergency Kill Switch Controller
 */

const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');

function triggerKillSwitch(req, res) {
  const { reason = 'Emergency Kill Switch Triggered' } = req.body || {};
  const source = (req.user && req.user.username) || 'operator';

  const result = circuitBreaker.triggerHalt(reason, source);
  res.json({
    success: true,
    message: 'Global cryptobiosis initiated. All active swarms halted.',
    result
  });
}

function resetKillSwitch(req, res) {
  const source = (req.user && req.user.username) || 'admin';
  const result = circuitBreaker.resetHalt(source);

  res.json({
    success: true,
    message: 'System runtime restored. Circuit breaker reset.',
    result
  });
}

function globalHalt(req, res) {
  return triggerKillSwitch(req, res);
}

function getSecurityStatus(req, res) {
  const cbStatus = circuitBreaker.getStatus();
  res.json({
    securityPosture: {
      rbacEnforced: true,
      csrfProtection: true,
      xssSanitization: true,
      mcpCircuitBreaker: cbStatus.state,
      killSwitchArmed: true,
      isHalted: cbStatus.isHalted,
      haltReason: cbStatus.haltReason,
      quarantinedToolsCount: cbStatus.quarantinedTools.length
    }
  });
}

module.exports = {
  triggerKillSwitch,
  resetKillSwitch,
  globalHalt,
  getSecurityStatus
};
