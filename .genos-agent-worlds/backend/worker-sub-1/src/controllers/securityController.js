/**
 * GenOS Security & Emergency Kill Switch Controller
 */

const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');
const fs = require('fs/promises');
const path = require('path');

function mcpHaltFile() {
  const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  return path.join(root, '.genos', 'mcp.halted');
}

async function triggerKillSwitch(req, res, next) {
  try {
  const { reason = 'Emergency Kill Switch Triggered' } = req.body || {};
  const source = (req.user && req.user.username) || 'operator';

  const result = circuitBreaker.triggerHalt(reason, source);
  const stoppedAgentIds = runtimeAdapter.stopAllMissions();
  const haltFile = mcpHaltFile();
  await fs.mkdir(path.dirname(haltFile), { recursive: true });
  await fs.writeFile(haltFile, `${JSON.stringify({ reason, source, haltedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  res.json({
    success: true,
    message: 'MCP kill switch engaged. New MCP tool invocations are blocked and local managed runtimes were stopped.',
    result,
    stoppedAgentIds
  });
  } catch (error) { next(error); }
}

async function resetKillSwitch(req, res, next) {
  try {
  const source = (req.user && req.user.username) || 'admin';
  const result = circuitBreaker.resetHalt(source);
  await fs.rm(mcpHaltFile(), { force: true });

  res.json({
    success: true,
    message: 'MCP kill switch reset. New MCP tool invocations may resume.',
    result
  });
  } catch (error) { next(error); }
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
