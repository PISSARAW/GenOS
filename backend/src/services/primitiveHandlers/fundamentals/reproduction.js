/**
 * Agent reproduction and lineage primitives: fork, recursiveFork, enforceReproductionLimits.
 */
const path = require('path');
const { getDatabase } = require('../../../db');
const agentAuthority = require('../../agentAuthorityService');
const agentEvolution = require('../../agentEvolutionService');
const workerGarage = require('../../workerGarageService');
const runtimeAdapter = require('../../agentRuntimeAdapter');

const DEFAULT_HAYFLICK_MAX_DEPTH = 5;
const DEFAULT_HAYFLICK_MAX_BUDS = 50;
const HARD_HAYFLICK_MAX_DEPTH = 32;
const HARD_HAYFLICK_MAX_BUDS = 50;

const PARENT_SELECT = `SELECT a.id, a.name, a.name_meaning, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier,
  a.language, a.isolation_mode, a.current_task, w.path AS workspace_root
  FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`;

function pick(value, fallback) {
  return value || fallback;
}

function forkName(orchestratorId) {
  return 'Forked Worker of ' + orchestratorId;
}

function readLimit(context, keys, fallback) {
  let value = fallback;
  for (let index = 0; index < keys.length; index++) {
    if (context[keys[index]]) {
      value = context[keys[index]];
      break;
    }
  }
  return Number(value);
}

function clampLimit(value, hardMax, fallback) {
  return Number.isFinite(value) ? Math.max(1, Math.min(hardMax, Math.floor(value))) : fallback;
}

function readCount(row) {
  return Number((row && row.count) || 0);
}

function buildBlocked(state) {
  const { parentId, currentDepth, maxDepth, currentBuds, maxBuds } = state;
  const error = currentDepth >= maxDepth
    ? `Hayflick limit reached: lineage depth ${currentDepth} reaches or exceeds maximum allowed depth ${maxDepth}. Reproduction blocked to prevent spawn storms.`
    : `Hayflick limit reached: parent agent '${parentId}' has accumulated ${currentBuds} buds (limit ${maxBuds}). Reproduction blocked.`;
  return { allowed: false, blockedByHayflick: true, error, currentDepth, maxDepth, currentBuds, maxBuds };
}

async function getLineageDepth(db, agentId) {
  let depth = 0;
  let currentId = agentId;
  const visited = new Set();
  while (currentId && !visited.has(currentId) && depth < 100) {
    visited.add(currentId);
    const row = await db.get('SELECT parent_agent_id FROM agents WHERE id = ?', currentId);
    if (!row || !row.parent_agent_id) break;
    depth++;
    currentId = row.parent_agent_id;
  }
  return depth;
}

async function enforceReproductionLimits(db, parentId, context = {}) {
  const keysDepth = ['maxDepth', 'max_depth', 'hayflickMaxDepth', 'hayflick_max_depth'];
  const keysBuds = ['maxBuds', 'max_buds', 'hayflickLimit', 'hayflick_limit'];
  const requestedDepth = readLimit(context, keysDepth, DEFAULT_HAYFLICK_MAX_DEPTH);
  const requestedBuds = readLimit(context, keysBuds, DEFAULT_HAYFLICK_MAX_BUDS);
  const maxDepth = clampLimit(requestedDepth, HARD_HAYFLICK_MAX_DEPTH, DEFAULT_HAYFLICK_MAX_DEPTH);
  const maxBuds = clampLimit(requestedBuds, HARD_HAYFLICK_MAX_BUDS, DEFAULT_HAYFLICK_MAX_BUDS);
  const currentDepth = await getLineageDepth(db, parentId);
  const childCountRow = await db.get('SELECT COUNT(*) as count FROM agents WHERE parent_agent_id = ?', parentId);
  const currentBuds = readCount(childCountRow);
  if (currentDepth >= maxDepth || currentBuds >= maxBuds) {
    return buildBlocked({ parentId, currentDepth, maxDepth, currentBuds, maxBuds });
  }
  return { allowed: true, currentDepth, maxDepth, currentBuds, maxBuds };
}

function loadParent(db, orchestratorId, orchestratorOnly) {
  const sql = orchestratorOnly ? PARENT_SELECT + " AND a.execution_mode = 'orchestrator'" : PARENT_SELECT;
  return db.get(sql, orchestratorId);
}

async function createDefaultOrchestrator(db, orchestratorId, context) {
  const defaultWs = await db.get('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1');
  const workspaceId = (defaultWs && defaultWs.id) || 'ws-genos-core';
  await db.run(
    `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, isolation_mode, current_task)
     VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', ?, 'frontier', 'Branch', ?)`,
    orchestratorId, workspaceId, pick(context.mission, 'strategy_fork')
  );
}

async function ensureParent(db, orchestratorId, context) {
  const orchestrator = await loadParent(db, orchestratorId, true);
  if (orchestrator) return orchestrator;
  const existing = await db.get('SELECT * FROM agents WHERE id = ?', orchestratorId);
  if (existing) {
    await db.run("UPDATE agents SET execution_mode = 'orchestrator' WHERE id = ?", orchestratorId);
  } else {
    await createDefaultOrchestrator(db, orchestratorId, context);
  }
  return loadParent(db, orchestratorId, false);
}

async function insertWorker(state) {
  const { db, parent, context, id } = state;
  const nameMeaning = pick(parent.name_meaning, `Fork identity of ${pick(parent.name, context.orchestratorId)}`);
  await db.run(
    "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, ?, 'worker', 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'fork', ?)",
    id, forkName(context.orchestratorId), nameMeaning, pick(parent.agent_type, 'GenOS'), parent.workspace_id, parent.fleet_id,
    pick(parent.model_tier, 'standard'), pick(parent.language, 'TypeScript'), pick(parent.isolation_mode, 'Branch'), context.orchestratorId,
    pick(context.mission, 'strategy_fork')
  );
}

async function recordLineage(state) {
  const { db, parent, context, id } = state;
  await agentEvolution.recordWorkerLineage(db, {
    agentId: id,
    name: forkName(context.orchestratorId),
    role: pick(context.role, 'worker'),
    workspaceId: parent.workspace_id
  }, {
    parentId: context.orchestratorId,
    edgeType: 'fork'
  }).catch(() => {});
}

async function reserveWorkerSlot(state) {
  const { db, context, id } = state;
  return workerGarage.reserveSlot(db, {
    orchestratorId: context.orchestratorId,
    workerId: id,
    name: forkName(context.orchestratorId),
    role: pick(context.role, 'worker'),
    mission: pick(context.mission, 'strategy_fork')
  });
}

async function prepareWorkspace(state) {
  const { parent, context, id } = state;
  const agentWorkspaceLifecycle = require('../../agentWorkspaceLifecycleService');
  const sourceRoot = parent.workspace_root || context.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
  const allowEdits = context.allowFileEdits === true || (context.executionPolicy && context.executionPolicy.allowFileEdits === true);
  const useVfs = !allowEdits || context.vfs === true || process.env.GENOS_VFS_WORKSPACES === '1';
  return agentWorkspaceLifecycle.createIsolatedWorkspace(sourceRoot, id, {
    capsuleRoot: context.capsuleRoot,
    vfs: useVfs
  });
}

function startWorkerMission(state, workerWorkspaceRoot) {
  const { parent, context } = state;
  return runtimeAdapter.startMission({
    agentId: state.id,
    name: forkName(context.orchestratorId),
    role: pick(context.role, 'worker'),
    prompt: pick(context.mission, 'strategy_fork'),
    modelTier: parent.model_tier || 'standard',
    executionMode: 'worker',
    agentType: parent.agent_type || 'GenOS',
    workspaceId: parent.workspace_id,
    workspaceRoot: workerWorkspaceRoot,
    workspaceIsolation: parent.isolation_mode || 'Branch',
    orchestratorAgentId: context.orchestratorId,
    executionBudget: context.executionBudget || {}
  });
}

async function spawnFork(state) {
  const id = 'worker_fork_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const scoped = { ...state, id };
  await insertWorker(scoped);
  await recordLineage(scoped);
  const slot = await reserveWorkerSlot(scoped);
  const workerWorkspaceRoot = await prepareWorkspace(scoped);
  const startPromise = startWorkerMission(scoped, workerWorkspaceRoot);
  startPromise.catch(async (error) => {
    await state.db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, id).catch(() => {});
  });
  return { success: true, forkedWorkerId: id, slot: slot.slot, status: 'queued' };
}

async function fork(context) {
  const orchestratorId = context.orchestratorId || context.agentId || 'orch_default';
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId required for fork.' };
  }
  try {
    const db = await getDatabase();
    const parent = await ensureParent(db, orchestratorId, context);
    if (!parent) return { success: false, error: `Orchestrator '${orchestratorId}' not found.` };
    await agentAuthority.requireOrchestrator(db, parent.id);
    const reproductionGuard = await enforceReproductionLimits(db, parent.id, context);
    if (!reproductionGuard.allowed) return { success: false, ...reproductionGuard };
    return await spawnFork({ db, parent, context });
  } catch (error) {
    return { success: false, error: 'Fork failed: ' + error.message };
  }
}

async function markSenescence(db, orchestratorId) {
  await db.run(
    `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Hayflick limit reached)' WHERE id = ? OR agent_id = ?`,
    orchestratorId, orchestratorId
  ).catch(() => {});
}

function buildRecursiveResult(forkResult, guard, nextBuds) {
  return {
    ...forkResult,
    recursiveFork: true,
    lineageDepth: guard.currentDepth + 1,
    maxDepth: guard.maxDepth,
    budScars: nextBuds,
    maxBuds: guard.maxBuds,
    remainingBuds: guard.maxBuds - nextBuds
  };
}

async function recursiveFork(context = {}) {
  const orchestratorId = context.orchestratorId || context.agentId || 'orch_default';
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId or agentId required for recursive_fork.' };
  }
  try {
    const db = await getDatabase();
    const reproductionGuard = await enforceReproductionLimits(db, orchestratorId, context);
    if (!reproductionGuard.allowed) {
      await markSenescence(db, orchestratorId);
      return { success: false, ...reproductionGuard };
    }
    const forkResult = await fork({ ...context, orchestratorId });
    if (!forkResult.success) {
      return forkResult;
    }
    const nextBuds = reproductionGuard.currentBuds + 1;
    if (nextBuds >= reproductionGuard.maxBuds) {
      await markSenescence(db, orchestratorId);
    }
    return buildRecursiveResult(forkResult, reproductionGuard, nextBuds);
  } catch (error) {
    return { success: false, error: 'Recursive fork failed: ' + error.message };
  }
}

module.exports = {
  fork,
  recursiveFork,
  enforceReproductionLimits,
  getLineageDepth
};
