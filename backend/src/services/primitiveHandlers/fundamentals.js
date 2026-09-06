/**
 * Lot 1 : Primitives fondamentales (snapshot, fork, vfs, revert, run, bisect, evaluate)
 */
const mcpExecutor = require('../mcpExecutor');
const evaluation = require('../evaluationObservabilityService');
const agentRecovery = require('../agentRecoveryService');
const fleet = require('../agentFleetService');
const epistemics = require('../epistemics');
const genosCli = require('../genosCli');
const { getDatabase } = require('../../db');
const modelProvider = require('../modelProvider');
const localModelDiscovery = require('../localModelDiscovery');
const workspaceSnapshotStore = require('../workspaceSnapshotStore');
const runtimeAdapter = require('../agentRuntimeAdapter');
const workerGarage = require('../workerGarageService');
const agentAuthority = require('../agentAuthorityService');

async function scopedWorkspace(db, workspaceId) {
  return db.get('SELECT id, path FROM workspaces WHERE id = ?', workspaceId);
}

async function snapshot(context) {
  if (context.workspaceId) {
    const db = await getDatabase();
    const workspace = await scopedWorkspace(db, context.workspaceId);
    if (!workspace) return { success: false, error: `Workspace '${context.workspaceId}' not found.` };
    const snap = await workspaceSnapshotStore.capture({
      db,
      workspace,
      label: context.label || `strategy_snapshot_${Date.now()}`,
      reason: context.reason || 'Strategy snapshot',
      author: context.agentId || context.orchestratorId || 'strategy_adapter'
    });
    return { success: true, snapshotId: snap.id, snapshotHash: snap.snapshotHash, stepNumber: snap.stepNumber };
  }
  return { success: false, error: 'workspaceId required for snapshot.' };
}

async function fork(context) {
  if (!context.orchestratorId) {
    return { success: false, error: 'orchestratorId required for fork.' };
  }
  try {
    const db = await getDatabase();
    const parent = await db.get(`SELECT a.id, a.name, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier,
      a.language, a.isolation_mode, a.current_task, w.path AS workspace_root
      FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'`, context.orchestratorId);
    if (!parent) return { success: false, error: `Orchestrator '${context.orchestratorId}' not found or has no workspace.` };
    await agentAuthority.requireOrchestrator(db, parent.id);
    const id = 'worker_fork_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await db.run(
      "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, current_task) VALUES (?, ?, 'worker', 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, ?)",
      id, 'Forked Worker of ' + context.orchestratorId, parent.agent_type || 'GenOS', parent.workspace_id, parent.fleet_id,
      parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', context.orchestratorId,
      context.mission || 'strategy_fork'
    );
    const slot = await workerGarage.reserveSlot(db, {
      orchestratorId: context.orchestratorId,
      workerId: id,
      name: 'Forked Worker of ' + context.orchestratorId,
      role: context.role || 'worker',
      mission: context.mission || 'strategy_fork'
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
      workspaceRoot: parent.workspace_root,
      workspaceIsolation: parent.isolation_mode || 'Branch',
      orchestratorAgentId: context.orchestratorId,
      executionBudget: context.executionBudget || {}
    });
    startPromise.catch(async (error) => {
      await db.run("UPDATE agents SET status='error', current_task=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", error.message, id).catch(() => {});
    });
    return { success: true, forkedWorkerId: id, slot: slot.slot, status: 'queued' };
  } catch (error) {
    return { success: false, error: 'Fork failed: ' + error.message };
  }
}

const DEFAULT_HAYFLICK_MAX_DEPTH = 5;
const DEFAULT_HAYFLICK_MAX_BUDS = 50;

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

async function recursiveFork(context = {}) {
  const orchestratorId = context.orchestratorId || context.agentId;
  if (!orchestratorId) {
    return { success: false, error: 'orchestratorId or agentId required for recursive_fork.' };
  }
  try {
    const db = await getDatabase();
    const maxDepth = Number(context.maxDepth || context.max_depth || DEFAULT_HAYFLICK_MAX_DEPTH);
    const maxBuds = Number(context.maxBuds || context.max_buds || context.hayflickLimit || DEFAULT_HAYFLICK_MAX_BUDS);

    // Check lineage depth (Hayflick generational limit)
    const currentDepth = await getLineageDepth(db, orchestratorId);
    if (currentDepth >= maxDepth) {
      return {
        success: false,
        blockedByHayflick: true,
        error: `Hayflick limit reached: lineage depth ${currentDepth} reaches or exceeds maximum allowed depth ${maxDepth}. Recursive fork blocked to prevent spawn storms.`,
        currentDepth,
        maxDepth
      };
    }

    // Check total bud count for this parent agent (Hayflick scar limit)
    const childCountRow = await db.get('SELECT COUNT(*) as count FROM agents WHERE parent_agent_id = ?', orchestratorId);
    const currentBuds = childCountRow ? childCountRow.count : 0;
    if (currentBuds >= maxBuds) {
      return {
        success: false,
        blockedByHayflick: true,
        error: `Hayflick limit reached: parent agent '${orchestratorId}' has accumulated ${currentBuds} buds (limit: ${maxBuds}). Recursive fork blocked.`,
        currentBuds,
        maxBuds
      };
    }

    // Delegate to standard fork
    const forkResult = await fork({ ...context, orchestratorId });
    if (!forkResult.success) {
      return forkResult;
    }

    return {
      ...forkResult,
      recursiveFork: true,
      lineageDepth: currentDepth + 1,
      maxDepth,
      budScars: currentBuds + 1,
      maxBuds,
      remainingBuds: maxBuds - (currentBuds + 1)
    };
  } catch (error) {
    return { success: false, error: 'Recursive fork failed: ' + error.message };
  }
}

async function slmRoute(context = {}) {
  const model = String(context.model || context.modelUri || '').trim();
  if (!model) return { success: false, error: 'model or modelUri required for provider routing.' };
  const status = modelProvider.getModelStatus(model);
  if (!status.configured || !status.apiKeyConfigured) {
    return { success: false, error: status.error || `Model provider is not configured for ${model}.` };
  }
  if (['ollama', 'lmstudio', 'vllm'].includes(status.provider)) {
    const discovered = await localModelDiscovery.discoverLocalModels();
    if (!discovered.some((candidate) => candidate.uri === model)) {
      return { success: false, error: `Local model '${model}' was not discovered.` };
    }
  }
  return { success: true, routedTo: model, provider: status.provider, verified: true };
}

async function bisectAgent(context) {
  const bisectService = require('../bisectionService');
  if (context.workspaceId && context.bugTrigger) {
    const res = await bisectService.bisectAnomalyAsync(context.workspaceId, context.bugTrigger);
    return { success: true, bisectionResult: res };
  }
  return { success: false, error: 'workspaceId and bugTrigger required for bisection.' };
}

function entropyCheck(context) {
  if (!Array.isArray(context.actionHistory) || context.actionHistory.length === 0) {
    return { success: false, error: 'actionHistory required for entropy check.' };
  }
  const counts = new Map();
  for (const action of context.actionHistory) counts.set(action, (counts.get(action) || 0) + 1);
  const total = context.actionHistory.length;
  const entropy = [...counts.values()].reduce((sum, count) => {
    const probability = count / total;
    return sum - probability * Math.log2(probability);
  }, 0);
  return { success: true, entropy, samples: total };
}

async function evaluate(context) {
  try {
    const evalResult = await evaluation.runImpossibleBench({ task: context.task || 'test' });
    const isGood = evalResult.brierScore < 0.4;
    return { success: isGood, brierScore: evalResult.brierScore, metrics: evalResult };
  } catch (err) {
    return { success: false, status: 'incomplete', code: err.code || 'EVALUATION_FAILED', error: err.message, runId: err.runId || null };
  }
}

async function vfsDryRun(context) {
  const vfs = require('../vfsSandboxService');
  if (context.workspaceId && context.patch) {
    try {
      const res = vfs.dryRunPatch(context.workspaceId, context.patch, context.vfsState || {});
      return { success: res.clean, dryRunCompleted: true, blastRadius: res.blastRadius, sideEffects: res.sideEffects };
    } catch (error) {
      return { success: false, dryRunCompleted: false, error: error.message };
    }
  }
  return { success: false, error: 'workspaceId and patch required for VFS dry-run.' };
}

async function safeRevert(context) {
  if (context.workspaceId && context.snapshotId) {
    const db = await getDatabase();
    const workspace = await scopedWorkspace(db, context.workspaceId);
    if (!workspace) return { success: false, error: `Workspace '${context.workspaceId}' not found.` };
    const result = await workspaceSnapshotStore.restore({
      db,
      workspace,
      reference: context.snapshotId,
      author: context.agentId || context.orchestratorId || 'strategy_adapter'
    });
    return {
      success: true,
      revertedTo: result.restoredSnapshot.id,
      safetySnapshotId: result.safetySnapshot.id,
      strategy: result.strategy
    };
  }
  return { success: false, error: 'workspaceId and snapshotId required for revert.' };
}

async function run(context) {
  if (context.orchestratorId && context.tool) {
    const res = await mcpExecutor.execute({ agentId: context.orchestratorId, toolName: context.tool, args: context.args || {} });
    const epistemic = epistemics.validateToolPerception(res, context.tool);
    return {
      success: res.success && !epistemic.isInvalid(),
      status: epistemic.isInvalid() ? 'epistemic_invalid' : 'completed',
      result: res,
      epistemicState: epistemic.state
    };
  }
  return { success: false, error: 'orchestratorId and tool required for execution.' };
}

async function cryptobiosisFreeze(context) {
  const agentId = context.agentId || context.targetId;
  if (!agentId) return { success: false, error: 'agentId required for cryptobiosis freeze.' };
  const db = await getDatabase();
  const agent = await db.get('SELECT id, workspace_id, status FROM agents WHERE id = ?', agentId);
  if (!agent) return { success: false, error: `Agent '${agentId}' not found.` };
  const state = context.state || context.snapshot || { agentId, workspaceId: agent.workspace_id, frozenAt: Date.now() };
  const runtimeStopped = runtimeAdapter.stopMission(agentId);
  try {
    const res = await genosCli.runCryptobiosisFreeze(agentId, { state });
    const data = res.data;
    if (res.ok && data && data.agent_id === agentId && typeof data.capsule_hash === 'string' && /^[a-f0-9]{64}$/i.test(data.capsule_hash)) {
      const snapshotId = data.capsule_id || `${agentId}:${data.capsule_hash}`;
      await db.run(
        `INSERT INTO cryptobiosis_snapshots (snapshot_id, agent_id, workspace_id, capsule_hash, status, metadata_json)
         VALUES (?, ?, ?, ?, 'frozen', ?)`,
        snapshotId, agentId, agent.workspace_id || null, data.capsule_hash,
        JSON.stringify({ status: data.status, bunkerArmor: data.bunker_armor, runtimeStopped })
      );
      await db.run("UPDATE agents SET current_task = ?, runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?", '[CRYPTOBIOSIS] Frozen capsule', agentId);
      return {
        success: true,
        cryptobiosis: data,
        agentId,
        bunkerArmor: data.bunker_armor,
        capsuleHash: data.capsule_hash,
        status: data.status || 'FROZEN_VITRIFIED',
        runtimeStopped,
        durable: true
      };
    }
    return { success: false, agentId, runtimeStopped, error: res.error || 'Cryptobiosis freeze returned an invalid capsule.' };
  } catch (error) {
    return { success: false, agentId, error: 'Cryptobiosis freeze failed: ' + error.message };
  }
}

async function cryptobiosisThaw(context) {
  const agentId = context.agentId || context.targetId;
  if (!agentId) return { success: false, error: 'agentId required' };
  const db = await getDatabase();
  const snapshot = await db.get("SELECT * FROM cryptobiosis_snapshots WHERE agent_id = ? AND status = 'frozen' ORDER BY frozen_at DESC LIMIT 1", agentId);
  if (!snapshot) return { success: false, agentId, error: 'No frozen durable capsule found for agent.' };
  await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawing' WHERE snapshot_id = ? AND status = 'frozen'", snapshot.snapshot_id);
  try {
    const res = await genosCli.runCryptobiosisThaw(agentId);
    const data = res.data;
    if (res.ok && data && (data.agent_id === undefined || data.agent_id === agentId) && data.status === 'RESUSCITATED') {
      await db.run("UPDATE cryptobiosis_snapshots SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ?", snapshot.snapshot_id);
      await db.run("UPDATE agents SET current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", '[CRYPTOBIOSIS] Resuscitated', agentId);
      return {
        success: true,
        thawed: data,
        agentId,
        hydrationLevel: data.hydration_level,
        status: data.status,
        snapshotId: snapshot.snapshot_id,
        durable: true
      };
    }
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'failed' WHERE snapshot_id = ?", snapshot.snapshot_id);
    return { success: false, agentId, snapshotId: snapshot.snapshot_id, error: res.error || 'Cryptobiosis thaw returned invalid identity or status.' };
  } catch (error) {
    await db.run("UPDATE cryptobiosis_snapshots SET status = 'failed' WHERE snapshot_id = ?", snapshot.snapshot_id).catch(() => {});
    return { success: false, agentId, error: 'Cryptobiosis thaw failed: ' + error.message };
  }
}

module.exports = {
  snapshot,
  fork,
  recursiveFork,
  slmRoute,
  bisectAgent,
  entropyCheck,
  evaluate,
  vfsDryRun,
  safeRevert,
  run,
  cryptobiosisFreeze,
  cryptobiosisThaw
};
