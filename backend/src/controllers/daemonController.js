/**
 * Daemon Controller
 * Exposes endpoints to inspect and configure the proactive Sentinel Agent
 * and its Windows autostart capabilities.
 */

const daemon = require('../services/daemonAgentAutostart');

function getStatus(req, res, next) {
  try {
    const status = daemon.getAutostartStatus();
    res.json(status);
  } catch (err) {
    next(err);
  }
}

function extractConfigUpdates(body) {
  const { name, personality, role, githubDir, openTerminalOnStartup, enabled } = body || {};
  const updates = {};
  if (name) updates.name = String(name).trim();
  if (personality) updates.personality = String(personality).trim();
  if (role) updates.role = String(role).trim();
  if (githubDir) updates.githubDir = String(githubDir).trim();
  if (typeof openTerminalOnStartup === 'boolean') updates.openTerminalOnStartup = openTerminalOnStartup;
  if (typeof enabled === 'boolean') updates.enabled = enabled;
  return updates;
}

function applyAutostartIfNeeded(enabled, saved, daemon) {
  if (typeof enabled !== 'boolean') return { success: true };
  return enabled ? daemon.enableAutostart(saved) : daemon.disableAutostart();
}

function configure(req, res, next) {
  try {
    const updates = extractConfigUpdates(req.body);
    const saved = daemon.saveDaemonConfig({ ...updates, ...(updates.enabled === true ? { enabled: false } : {}) });
    const autostart = applyAutostartIfNeeded(updates.enabled, saved, daemon);
    if (!autostart.success) {
      return res.json({ success: false, config: daemon.getDaemonConfig(), autostart });
    }
    res.json({ success: true, config: daemon.getDaemonConfig() });
  } catch (err) {
    next(err);
  }
}

function setAutostart(req, res, next) {
  try {
    const enable = req.body?.enabled !== false;
    const result = enable ? daemon.enableAutostart() : daemon.disableAutostart();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function runAudit(req, res, next) {
  try {
    const cycle = await daemon.runProactiveCycle(req.body || {});
    res.json({ success: true, config: cycle.config, audit: cycle.audit, maintenance: cycle.maintenance });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStatus,
  configure,
  setAutostart,
  runAudit
};
