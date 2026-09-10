/**
 * GenOS Security & Emergency Kill Switch Controller
 */

const circuitBreaker = require('../services/circuitBreaker');
const telemetry = require('../services/telemetryObserver');
const runtimeAdapter = require('../services/agentRuntimeAdapter');
const { getDatabase } = require('../db');
const fs = require('fs/promises');
const path = require('path');

const HALT_MIN_INTERVAL_MS = Math.max(0, Number(process.env.GENOS_HALT_MIN_INTERVAL_MS) || 2000);
const lastHaltByActor = new Map();

function haltRateLimited(actor) {
  const now = Date.now();
  const last = lastHaltByActor.get(actor) || 0;
  if (now - last < HALT_MIN_INTERVAL_MS) return true;
  lastHaltByActor.set(actor, now);
  if (lastHaltByActor.size > 1000) lastHaltByActor.delete(lastHaltByActor.keys().next().value);
  return false;
}

async function recordSecurityAudit(actor, action, entry = {}) {
  try {
    const db = await getDatabase();
    await db.run(
      'INSERT INTO audit_logs (actor, action, resource, decision, reason, payload_json) VALUES (?, ?, ?, ?, ?, ?)',
      actor, action, 'system', 'allowed', entry.reason || '', JSON.stringify(entry.payload || {})
    );
  } catch (error) {
    console.warn('[Security] audit log write failed:', error.message);
  }
}

function mcpHaltFile() {
  const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  return path.join(root, '.genos', 'mcp.halted');
}

async function triggerKillSwitch(req, res, next) {
  try {
  const { reason = 'Emergency Kill Switch Triggered' } = req.body || {};
  const source = (req.user && req.user.username) || 'admin';
  if (haltRateLimited(source)) {
    return res.status(429).json({ error: { code: 'HALT_RATE_LIMITED', message: 'Kill switch toggled too frequently.' } });
  }

  const result = circuitBreaker.triggerHalt(reason, source);
  const stoppedAgentIds = runtimeAdapter.stopAllMissions();
  const haltFile = mcpHaltFile();
  await fs.mkdir(path.dirname(haltFile), { recursive: true });
  await fs.writeFile(haltFile, `${JSON.stringify({ reason, source, haltedAt: new Date().toISOString() })}\n`, { mode: 0o600 });
  await recordSecurityAudit(source, 'KILL_SWITCH_ENGAGE', { reason, payload: { stoppedAgentIds } });
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
  await recordSecurityAudit(source, 'KILL_SWITCH_RESET', { reason: 'Kill switch reset' });

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
