'use strict';

const { spawn } = require('node:child_process');
const { appendBounded } = require('./boundedOutput');
const { buildRuntimeEnvironment } = require('./agentProcessOutcome');
const { terminateChild } = require('./processTermination');
const securePaths = require('./trinityCapsulePaths');

const BLOCKED_CAPSULE_ENV = Object.freeze([
  'GENOS_DB_PATH',
  'GENOS_DB_BACKUP_SKIP',
  'GENOS_DB_BOOTSTRAP_SKIP',
  'GENOS_MCP_SAMPLING_URL',
  'GENOS_MCP_TOOL_URL',
  'GENOS_SOLAR_API_URL',
  'GENOS_GVX_LEDGER_HMAC_SECRET',
  'GENOS_TOOL_MEMBRANE_HMAC_SECRET'
]);

function buildEnvironment(root, requested = {}) {
  const safe = buildRuntimeEnvironment(requested, root, true);
  for (const name of BLOCKED_CAPSULE_ENV) delete safe[name];
  return {
    ...safe,
    GENOS_ROOT: root,
    GENOS_STUDIO_ROOT: root
  };
}

function spawnOptions(root, requested) {
  const detached = process.platform !== 'win32';
  return {
    detached,
    options: {
      cwd: root,
      detached,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: buildEnvironment(root, requested)
    }
  };
}

function capsuleError(message, code) {
  return Object.assign(new Error(message), { code });
}

function timeoutValue(value) {
  if (value === undefined) return 120000;
  if (!Number.isSafeInteger(value) || value < 1 || value > 600000) {
    throw capsuleError('Capsule bootstrap timeout must be between 1 and 600000ms.',
      'CAPSULE_BOOTSTRAP_TIMEOUT_INVALID');
  }
  return value;
}

function run(command, args, options = {}) {
  const root = securePaths.assertPath(options.root);
  const timeoutMs = timeoutValue(options.timeoutMs);
  const launch = spawnOptions(root, options.environment);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, launch.options);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      terminateChild(child, launch.detached);
      settle(reject, capsuleError(
        `GenOS capsule bootstrap timed out after ${timeoutMs}ms.`,
        'CAPSULE_BOOTSTRAP_TIMEOUT'
      ));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on('error', (error) => { settle(reject, error); });
    child.on('close', (code) => {
      if (code === 0) settle(resolve, stdout);
      else settle(reject, capsuleError(
        `GenOS capsule bootstrap failed (${code}): ${stderr.trim() || stdout.trim()}`,
        'CAPSULE_BOOTSTRAP_FAILED'
      ));
    });
  });
}

module.exports = { buildEnvironment, run };
