/**
 * Daemon Controller
 * Exposes endpoints to inspect and configure the proactive Sentinel Agent
 * and its Windows autostart capabilities.
 */

const fs = require('fs');
const path = require('path');
const daemon = require('../services/daemonAgentAutostart');

function sanitizeDirectoryPath(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return null;
  if (dirPath.includes('..') || dirPath.includes('\0')) return null;
  const resolved = path.resolve(dirPath);
  if (path.parse(resolved).root === resolved) return null;
  try {
    const stat = fs.statSync(resolved);
    return stat.isDirectory() ? resolved : null;
  } catch {
    return null;
  }
}

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
    if (githubDir) {
      const sanitized = sanitizeDirectoryPath(githubDir);
      if (sanitized) updates.githubDir = sanitized;
    }
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

async function runAudit(req, res, next) {
  try {
    const body = req.body || {};
    const options = { ...body };
    if (options.githubDir) {
      const sanitized = sanitizeDirectoryPath(options.githubDir);
      if (sanitized) options.githubDir = sanitized;
      else delete options.githubDir;
    }
    const cycle = await daemon.runProactiveCycle(options);
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
