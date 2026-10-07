'use strict';

const recovery = require('./workerFailureRecoveryService');
const axolotl = require('./axolotlRegenerationHelpers');

function enterDormancy(agent, reason) {
  const source = agent || {};
  return {
    agentId: source.id || null,
    state: 'dormant',
    reason: reason || 'unspecified',
    enteredAt: new Date().toISOString(),
    memorySnapshot: source.memory || null,
    criticalFunctions: Array.isArray(source.criticalFunctions) ? source.criticalFunctions : []
  };
}

function awakenDormant(record, health) {
  const source = record || {};
  const ok = health && health.healthy === true;
  if (!ok) {
    return { ...source, state: 'dormant', awakenBlocked: (health && health.reason) || 'unhealthy host' };
  }
  return {
    agentId: source.agentId,
    state: 'active',
    awakenedAt: new Date().toISOString(),
    restoredMemory: source.memorySnapshot || null,
    restoredFunctions: source.criticalFunctions || []
  };
}

function pickSuccessor(loss, reserve) {
  const pool = Array.isArray(reserve) ? reserve : [];
  const sameWorkspace = pool.filter((c) => c.workspaceId && c.workspaceId === loss.workspaceId);
  const candidates = sameWorkspace.length ? sameWorkspace : pool;
  const lineageMatch = candidates.filter((c) => c.lineage && loss.lineage && c.lineage === loss.lineage);
  const lineagePool = lineageMatch.length ? lineageMatch : candidates;
  const capable = lineagePool.filter((c) => Array.isArray(c.capabilities) && c.capabilities.includes(loss.criticalFunction));
  const chosen = (capable.length ? capable : lineagePool)[0] || null;
  return chosen;
}

function planSuccession(loss, reserve) {
  const source = loss || {};
  const report = recovery.failureReport(source.event || {}, source.mission || {});
  const decision = recovery.decideRecovery({ ...report, attempt: source.attempt || 0, maxAttempts: source.maxAttempts || 1 });
  const successor = pickSuccessor(source, reserve);
  const memoryKeys = source.memorySnapshot && typeof source.memorySnapshot === 'object'
    ? Object.keys(source.memorySnapshot) : [];
  const regenerationPath = axolotl.buildRegenerationPath(
    { signature: source.topology || 'unknown' },
    { id: successor ? successor.id : null, signature: `succession:${source.criticalFunction || 'unspecified'}` },
    memoryKeys
  );
  return planSuccessionResult({ source, report, decision, successor, memoryKeys, regenerationPath });
}

module.exports = { enterDormancy, awakenDormant, pickSuccessor, planSuccession };

function planSuccessionResult({ source, report, decision, successor, memoryKeys, regenerationPath }) {
  return {
    deceasedId: source.deceasedId || null,
    criticalFunction: source.criticalFunction || null,
    failureCategory: report.category || null,
    recoveryDecision: decision,
    successorId: successor ? successor.id : null,
    memoryRestored: memoryKeys,
    regenerationPath
  };
}
