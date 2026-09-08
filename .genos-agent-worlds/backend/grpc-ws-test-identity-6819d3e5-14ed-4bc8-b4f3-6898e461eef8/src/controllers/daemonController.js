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

function configure(req, res, next) {
  try {
    const { name, personality, role, githubDir, openTerminalOnStartup, enabled } = req.body || {};
    const updates = {};
    if (name) updates.name = String(name).trim();
    if (personality) updates.personality = String(personality).trim();
    if (role) updates.role = String(role).trim();
    if (githubDir) updates.githubDir = String(githubDir).trim();
    if (typeof openTerminalOnStartup === 'boolean') updates.openTerminalOnStartup = openTerminalOnStartup;
    if (typeof enabled === 'boolean') updates.enabled = enabled;

    const saved = daemon.saveDaemonConfig(updates);
    if (typeof enabled === 'boolean') {
      if (enabled) daemon.enableAutostart(saved);
      else daemon.disableAutostart();
    }

    res.json({ success: true, config: saved });
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

function runAudit(req, res, next) {
  try {
    const cycle = daemon.runProactiveCycle(req.body || {});
    res.json({ success: true, config: cycle.config, audit: cycle.audit });
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
