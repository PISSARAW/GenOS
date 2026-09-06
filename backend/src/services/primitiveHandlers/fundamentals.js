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

async function snapshot(context) {
  if (context.workspaceId) {
    const label = 'strategy_snapshot_' + Date.now();
    const snap = await agentRecovery.createSnapshot(await getDatabase(), context.workspaceId, label);
    return { success: true, snapshotId: snap.id };
  }
  return { success: false, error: 'workspaceId required for snapshot.' };
}

async function fork(context) {
  if (!context.orchestratorId) {
    return { success: false, error: 'orchestratorId required for fork.' };
  }
  try {
    const db = await getDatabase();
    const id = 'worker_fork_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await db.run(
      "INSERT INTO agents (id, name, role, status, agent_type, execution_mode, parent_agent_id, current_task) VALUES (?, ?, 'worker', 'idle', 'GenOS', 'worker', ?, ?)",
      id, 'Forked Worker of ' + context.orchestratorId, context.orchestratorId, context.mission || 'strategy_fork'
    );
    return { success: true, forkedWorkerId: id };
  } catch (error) {
    return { success: false, error: 'Fork failed: ' + error.message };
  }
}

function slmRoute() {
  return { success: true, routedTo: 'small_local_model' };
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
    return { success: false, error: err.message };
  }
}

async function vfsDryRun(context) {
  const vfs = require('../vfsSandboxService');
  if (context.workspaceId && context.patch) {
    const res = await vfs.dryRunPatch(context.workspaceId, context.patch);
    return { success: res.clean, dryRunCompleted: true, blastRadius: res.blastRadius };
  }
  return { success: false, error: 'workspaceId and patch required for VFS dry-run.' };
}

async function safeRevert(context) {
  if (context.workspaceId && context.snapshotId) {
    await agentRecovery.restoreSnapshot(await getDatabase(), context.workspaceId, context.snapshotId);
    return { success: true, revertedTo: context.snapshotId };
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
  const agentId = context.agentId || context.targetId || ('dormant_' + Date.now());
  const state = context.state || context.snapshot || { agentId, frozenAt: Date.now() };
  try {
    const res = await genosCli.runCryptobiosisFreeze(agentId, { state });
    if (res.ok && res.data) {
      return {
        success: true,
        cryptobiosis: res.data,
        agentId,
        bunkerArmor: res.data.bunker_armor,
        capsuleHash: res.data.capsule_hash,
        status: res.data.status || 'FROZEN_VITRIFIED'
      };
    }
  } catch (error) {
    return { success: false, agentId, error: 'Cryptobiosis freeze failed: ' + error.message };
  }
  return { success: false, agentId, error: 'Cryptobiosis freeze returned no capsule.' };
}

async function cryptobiosisThaw(context) {
  const agentId = context.agentId || context.targetId;
  if (!agentId) return { success: false, error: 'agentId required' };
  try {
    const res = await genosCli.runCryptobiosisThaw(agentId);
    if (res.ok && res.data) {
      return {
        success: res.data.success !== false,
        thawed: res.data,
        agentId,
        hydrationLevel: res.data.hydration_level,
        status: res.data.status
      };
    }
  } catch (error) {
    return { success: false, agentId, error: 'Cryptobiosis thaw failed: ' + error.message };
  }
  return { success: false, agentId, error: 'Cryptobiosis thaw returned no state.' };
}

module.exports = {
  snapshot,
  fork,
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
