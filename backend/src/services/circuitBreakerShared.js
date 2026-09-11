/**
 * Cross-worker sharing for the circuit breaker: a small file carries the
 * global/scoped OPEN state and `mcp_tools` carries tool quarantine locks.
 * All helpers are opt-in via GENOS_CIRCUIT_BREAKER_SHARED so unit tests keep
 * pure in-memory semantics.
 */
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('../db');

const DESTRUCTIVE_TOOLS = [
  'genos_run',
  'genos_merge',
  'genos_restore',
  'genos_resilience_apoptosis',
  'genos_resilience_circuit_breaker',
  'genos_resilience_cryptobiosis',
  'genos_resilience_hypermutation',
  'genos_invalidate_assumption',
  'genos_security_coevolution'
];
function sharedStatePath(breaker) {
  const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  return path.join(root, '.genos', 'circuit_breaker.json');
}

function persistSharedState(breaker) {
  if (!breaker.sharedState) return;
  const scopes = {};
  for (const [name, state] of breaker.scopedStates.entries()) scopes[name] = state.state;
  try {
    const file = sharedStatePath(breaker);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ global: breaker.state, scopes, changedAt: Date.now() }), 'utf8');
  } catch (_) {}
}

function applyRemoteScopes(breaker, scopes, now) {
  for (const [name, state] of Object.entries(scopes)) {
    const scoped = breaker.context(name);
    if (state === 'OPEN' && scoped.state !== 'OPEN') {
      scoped.state = 'OPEN';
      scoped.lastStateChange = now;
    }
  }
}

function syncSharedState(breaker) {
  if (!breaker.sharedState) return;
  const now = Date.now();
  if (now - breaker.lastSharedSync < 1000) return;
  breaker.lastSharedSync = now;
  let payload;
  try { payload = JSON.parse(fs.readFileSync(sharedStatePath(breaker), 'utf8')); } catch (_) { return; }
  if (payload?.global === 'OPEN' && breaker.state !== 'OPEN') {
    breaker.state = 'OPEN';
    breaker.lastStateChange = now;
  }
  applyRemoteScopes(breaker, payload?.scopes || {}, now);
}

function haltPath() {
  const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  return path.join(root, '.genos', 'mcp.halted');
}

function loadPersistedHalt() {
  try {
    if (!fs.existsSync(haltPath())) return null;
    const data = JSON.parse(fs.readFileSync(haltPath(), 'utf8'));
    return { reason: data.reason || 'Persisted emergency halt', haltedAt: data.haltedAt || null };
  } catch (_) {
    return { reason: 'Persisted emergency halt', haltedAt: null };
  }
}

function persistHalt(reason, haltedAt) {
  try {
    fs.mkdirSync(path.dirname(haltPath()), { recursive: true });
    fs.writeFileSync(haltPath(), JSON.stringify({ reason, haltedAt }), 'utf8');
  } catch (_) {}
}

function refreshPersistedHalt(breaker) {
  const persisted = loadPersistedHalt();
  if (persisted) {
    breaker.isHalted = true;
    breaker.haltReason = persisted.reason;
    breaker.haltTimestamp = persisted.haltedAt;
  } else if (breaker.isHalted) {
    breaker.isHalted = false;
    breaker.haltReason = null;
    breaker.haltTimestamp = null;
  }
}

function maybeRefreshToolLocks(breaker) {
  if (!breaker.sharedState) return;
  const now = Date.now();
  if (now - breaker.lastToolLockSync < 5000) return;
  breaker.lastToolLockSync = now;
  getDatabase().then((db) => breaker.hydrateToolLocks(db)).catch(() => {});
}

function removePersistedHalt() {
  try {
    fs.unlinkSync(haltPath());
  } catch (_) {}
}

function scopedStatePath() {
  const root = process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  return path.join(root, '.genos', 'circuit_breaker_scopes.json');
}

function loadScopedStates(scopedStates) {
  try {
    const data = JSON.parse(fs.readFileSync(scopedStatePath(), 'utf8'));
    for (const [name, state] of Object.entries(data.scopes || {})) {
      if (state === 'OPEN' || state === 'HALF-OPEN') {
        scopedStates.set(name, {
          state,
          failureCount: 0,
          failureTimes: [],
          lastFailureTime: 0,
          lastStateChange: data.changedAt || Date.now(),
          halfOpenProbe: null
        });
      }
    }
  } catch (_) {}
}

function persistScopedStates(scopedStates) {
  try {
    const scopes = {};
    for (const [name, state] of scopedStates.entries()) {
      if (state.state === 'OPEN' || state.state === 'HALF-OPEN') scopes[name] = state.state;
    }
    if (Object.keys(scopes).length === 0) return;
    const file = scopedStatePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ scopes, changedAt: Date.now() }), 'utf8');
  } catch (_) {}
}

module.exports = {
  persistSharedState,
  syncSharedState,
  maybeRefreshToolLocks,
  loadPersistedHalt,
  persistHalt,
  removePersistedHalt,
  refreshPersistedHalt,
  scopedStatePath,
  loadScopedStates,
  persistScopedStates,
  DESTRUCTIVE_TOOLS
};

