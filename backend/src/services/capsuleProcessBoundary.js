'use strict';

const { spawn } = require('node:child_process');
const { appendBounded } = require('./boundedOutput');
const { buildRuntimeEnvironment } = require('./agentProcessOutcome');
const { terminateChild, gracePeriodMs, clearTerminationTimer } = require('./processTermination');
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
    const state = { child: spawn(command, args, launch.options), detached: launch.detached,
      stdout: '', stderr: '', failure: null, missingStreams: [], settled: false, closed: false,
      stopping: false, timer: null, cleanupTimer: null, terminationError: null, resolve, reject };
    observeProcess(state);
    state.timer = setTimeout(() => failProcess(state, capsuleError(
      `GenOS capsule bootstrap timed out after ${timeoutMs}ms.`, 'CAPSULE_BOOTSTRAP_TIMEOUT'
    )), timeoutMs);
  });
}

function observeProcess(state) {
  state.child.on('error', (error) => { failProcess(state, error); });
  state.child.on('close', (code) => { closeProcess(state, code); });
  observeStream(state, 'stdout');
  observeStream(state, 'stderr');
}

function observeStream(state, source) {
  const stream = state.child[source];
  if (!stream) { state.missingStreams.push(source); return; }
  stream.on('error', (error) => { failProcess(state, ioError(source, error)); });
  stream.on('data', (chunk) => { state[source] = appendBounded(state[source], chunk); });
}

function ioError(source, cause) {
  return Object.assign(capsuleError(`GenOS capsule bootstrap ${source} failed: ${cause.message}`,
    'CAPSULE_BOOTSTRAP_IO_ERROR'), { stream: source, causeCode: cause.code || null, cause });
}

function failProcess(state, error) {
  if (!state.failure) state.failure = error;
  if (state.closed || state.settled) return;
  requestTermination(state);
}

function requestTermination(state) {
  if (state.stopping) return;
  state.stopping = true;
  state.cleanupTimer = setTimeout(() => terminationUnconfirmed(state), gracePeriodMs() + 250);
  try { terminateChild(state.child, state.detached); }
  catch (error) { state.terminationError = error; }
}

function terminationUnconfirmed(state) {
  if (state.closed || state.settled) return;
  const error = Object.assign(capsuleError('GenOS capsule bootstrap termination was not observed before the cleanup deadline.',
    'CAPSULE_BOOTSTRAP_TERMINATION_UNCONFIRMED'), { cleanupPending: true, cause: state.failure,
    terminationError: state.terminationError });
  settleProcess(state, error);
}

function closeProcess(state, code) {
  state.closed = true;
  clearTerminationTimer(state.child);
  if (!state.failure && state.missingStreams.length) {
    const cause = Object.assign(new Error('Required capsule output stream is unavailable.'), { code: 'STDIO_UNAVAILABLE' });
    state.failure = ioError(state.missingStreams[0], cause);
  }
  if (!state.failure && code !== 0) state.failure = capsuleError(
    `GenOS capsule bootstrap failed (${code}): ${state.stderr.trim() || state.stdout.trim()}`, 'CAPSULE_BOOTSTRAP_FAILED');
  settleProcess(state, state.failure);
}

function settleProcess(state, error) {
  if (state.settled) return;
  state.settled = true;
  clearTimeout(state.timer);
  clearTimeout(state.cleanupTimer);
  if (error) state.reject(error);
  else state.resolve(state.stdout);
}

module.exports = { buildEnvironment, run };
