/**
 * Agent reproduction and lineage primitives: fork, recursiveFork, enforceReproductionLimits.
 */
const path = require('path');
const crypto = require('crypto');
const { getDatabase } = require('../../../db');
const agentAuthority = require('../../agentAuthorityService');
const agentEvolution = require('../../agentEvolutionService');
const workerGarage = require('../../workerGarageService');
const runtimeAdapter = require('../../agentRuntimeAdapter');

const DEFAULT_HAYFLICK_MAX_DEPTH = 5;
const DEFAULT_HAYFLICK_MAX_BUDS = 50;
const HARD_HAYFLICK_MAX_DEPTH = 32;
const HARD_HAYFLICK_MAX_BUDS = 50;

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

function getRequestedDepth(context) {
  const raw = context.maxDepth ?? context.max_depth ?? context.hayflickMaxDepth ?? context.hayflick_max_depth;
  const num = Number(raw ?? DEFAULT_HAYFLICK_MAX_DEPTH);
  return Number.isFinite(num) ? Math.max(1, Math.min(HARD_HAYFLICK_MAX_DEPTH, Math.floor(num))) : DEFAULT_HAYFLICK_MAX_DEPTH;
}

function getRequestedBuds(context) {
  const raw = context.maxBuds ?? context.max_buds ?? context.hayflickLimit ?? context.hayflick_limit;
  const num = Number(raw ?? DEFAULT_HAYFLICK_MAX_BUDS);
  return Number.isFinite(num) ? Math.max(1, Math.min(HARD_HAYFLICK_MAX_BUDS, Math.floor(num))) : DEFAULT_HAYFLICK_MAX_BUDS;
}

async function enforceReproductionLimits(db, parentId, context = {}) {
  const maxDepth = getRequestedDepth(context);
  const maxBuds = getRequestedBuds(context);
  const currentDepth = await getLineageDepth(db, parentId);
  const childCountRow = await db.get('SELECT COUNT(*) as count FROM agents WHERE parent_agent_id = ?', parentId);
  const currentBuds = Number(childCountRow?.count || 0);

  if (currentDepth >= maxDepth) {
    return {
      allowed: false,
      blockedByHayflick: true,
      error: `Hayflick limit reached: lineage depth ${currentDepth} reaches or exceeds maximum allowed depth ${maxDepth}. Reproduction blocked to prevent spawn storms.`,
      currentDepth, maxDepth, currentBuds, maxBuds
    };
  }
  if (currentBuds >= maxBuds) {
    return {
      allowed: false,
      blockedByHayflick: true,
      error: `Hayflick limit reached: parent agent '${parentId}' has accumulated ${currentBuds} buds (limit ${maxBuds}). Reproduction blocked.`,
      currentDepth, maxDepth, currentBuds, maxBuds
    };
  }
  return { allowed: true, currentDepth, maxDepth, currentBuds, maxBuds };
}

async function ensureOrchestratorParent(db, orchestratorId, context) {
  let parent = await db.get(`SELECT a.id, a.name, a.name_meaning, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier,
    a.language, a.isolation_mode, a.current_task, w.path AS workspace_root
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'`, orchestratorId);
  if (parent) return parent;

  const existing = await db.get('SELECT * FROM agents WHERE id = ?', orchestratorId);
  if (existing) {
    await db.run("UPDATE agents SET execution_mode = 'orchestrator' WHERE id = ?", orchestratorId);
  } else {
    const defaultWs = await db.get('SELECT id FROM workspaces ORDER BY created_at ASC LIMIT 1');
    await db.run(
      `INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, workspace_id, model_tier, isolation_mode, current_task)
       VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', ?, 'frontier', 'Branch', ?)`,
      orchestratorId, defaultWs?.id || 'ws-genos-core', context.mission || 'strategy_fork'
    );
  }
  return db.get(`SELECT a.id, a.name, a.name_meaning, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier,
    a.language, a.isolation_mode, a.current_task, w.path AS workspace_root
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, orchestratorId);
}

async function insertForkedAgent(db, opts) {
  const { id, parent, context } = opts;
  const orchId = context.orchestratorId;
  const meaning = parent.name_meaning || `Fork identity of ${parent.name || orchId}`;
  await db.run(
    "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, ?, 'worker', 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'fork', ?)",
    id, 'Forked Worker of ' + orchId, meaning, parent.agent_type || 'GenOS', parent.workspace_id, parent.fleet_id,
    parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', orchId,
    context.mission || 'strategy_fork'
  );
  await agentEvolution.recordWorkerLineage(db, {
    agentId: id,
    name: 'Forked Worker of ' + orchId,
    role: context.role || 'worker',
    workspaceId: parent.workspace_id
  }, {
    parentId: orchId,
    edgeType: 'fork'
  }).catch(() => {});
}

function resolveSourceRoot(parent, context) {
  return parent.workspace_root || context.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT || path.resolve(__dirname, '../../..');
}

function resolveUseVfs(context) {
  const allowEdits = context.allowFileEdits === true || context.executionPolicy?.allowFileEdits === true;
  return !allowEdits || context.vfs === true || process.env.GENOS_VFS_WORKSPACES === '1';
}

async function startForkedWorker(db, opts) {
  const { id, parent, context } = opts;
  const agentWorkspaceLifecycle = require('../../agentWorkspaceLifecycleService');
  const sourceRoot = resolveSourceRoot(parent, context);
  const useVfs = resolveUseVfs(context);
  const workerWorkspaceRoot = await agentWorkspaceLifecycle.createIsolatedWorkspace(sourceRoot, id, {
    capsuleRoot: context.capsuleRoot,
    vfs: useVfs
  });

  const startPromise = runtimeAdapter.startMission({
    agentId: id,
    name: 'Forked Worker of ' + context.orchestratorId,
    role: context.role || 'worker',
    prompt: context.mission || 'strategy_fork',
    modelTier: parent.model_tier || 'standard',
    executionMode: 'worker',
    agentType: parent.agent_type || 'GenOS',
    workspaceId: parent.workspace_id,
    workspaceRoot: workerWorkspaceRoot,
    workspaceIsolation: parent.isolation_mode || 'Branch',
    orchestratorAgentId: context.orchestratorId,
    executionBudget: context.executionBudget || {}
  });
  startPromise.catch(async (error) => {
    await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, id).catch(() => {});
  });
}

async function fork(context) {
  const orchestratorId = context.orchestratorId || context.agentId || 'orch_default';
  if (!orchestratorId) return { success: false, error: 'orchestratorId required for fork.' };

  try {
    const db = await getDatabase();
    const parent = await ensureOrchestratorParent(db, orchestratorId, context);
    if (!parent) return { success: false, error: `Orchestrator '${orchestratorId}' not found.` };

    await agentAuthority.requireOrchestrator(db, parent.id);
    const reproductionGuard = await enforceReproductionLimits(db, parent.id, context);
    if (!reproductionGuard.allowed) return { success: false, ...reproductionGuard };

    const id = 'worker_fork_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const workerOpts = { id, parent, context };
    await insertForkedAgent(db, workerOpts);

    const slot = await workerGarage.reserveSlot(db, {
      orchestratorId: context.orchestratorId,
      workerId: id,
      name: 'Forked Worker of ' + context.orchestratorId,
      role: context.role || 'worker',
      mission: context.mission || 'strategy_fork'
    });

    await startForkedWorker(db, workerOpts);
    return { success: true, forkedWorkerId: id, slot: slot.slot, status: 'queued' };
  } catch (error) {
    return { success: false, error: 'Fork failed: ' + error.message };
  }
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
      await db.run(
        `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Hayflick limit reached)' WHERE id = ? OR agent_id = ?`,
        orchestratorId, orchestratorId
      ).catch(() => {});
      return { success: false, ...reproductionGuard };
    }

    const forkResult = await fork({ ...context, orchestratorId });
    if (!forkResult.success) {
      return forkResult;
    }

    const nextBuds = reproductionGuard.currentBuds + 1;
    if (nextBuds >= reproductionGuard.maxBuds) {
      await db.run(
        `UPDATE lineage_nodes SET state_summary = 'Replicative Senescence (Hayflick limit reached)' WHERE id = ? OR agent_id = ?`,
        orchestratorId, orchestratorId
      ).catch(() => {});
    }

    return {
      ...forkResult,
      recursiveFork: true,
      lineageDepth: reproductionGuard.currentDepth + 1,
      maxDepth: reproductionGuard.maxDepth,
      budScars: nextBuds,
      maxBuds: reproductionGuard.maxBuds,
      remainingBuds: reproductionGuard.maxBuds - nextBuds
    };
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
