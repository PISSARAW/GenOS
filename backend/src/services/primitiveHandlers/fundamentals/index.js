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
const { resolveContainedPath } = require('../pathSafety');
const modelProvider = require('../modelProvider');
const localModelDiscovery = require('../localModelDiscovery');
const workspaceSnapshotStore = require('../workspaceSnapshotStore');
const runtimeAdapter = require('../agentRuntimeAdapter');
const workerGarage = require('../workerGarageService');
const agentAuthority = require('../agentAuthorityService');
const agentEvolution = require('../agentEvolutionService');
const { spawn } = require('child_process');
const { terminateChild } = require('../processTermination');
const { isAllowedSandboxTestCommand, normalizeSandboxCommand } = require('../sandboxCommandPolicy');

async function scopedWorkspace(db, workspaceId) {
  return db.get('SELECT id, path FROM workspaces WHERE id = ?', workspaceId);
}

function runBoundedTestCommand(command, cwd, timeoutMs = 120000) {
  const normalized = normalizeSandboxCommand(command);
  if (!isAllowedSandboxTestCommand(normalized)) throw new Error('Test command is not allow-listed.');
  const windows = process.platform === 'win32';
  const shell = windows ? (process.env.ComSpec || 'cmd.exe') : '/bin/sh';
  const args = windows ? ['/d', '/s', '/c', normalized] : ['-c', normalized];
  return new Promise((resolve, reject) => {
    const child = spawn(shell, args, { cwd, detached: process.platform !== 'win32', windowsVerbatimArguments: windows, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateChild(child);
      const error = new Error(`Test command timed out after ${timeoutMs}ms.`);
      error.code = 'TEST_TIMEOUT';
      reject(error);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { stdout = `${stdout}${chunk}`.slice(-20000); });
    child.stderr.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-20000); });
    child.once('error', (error) => { if (!settled) { settled = true; clearTimeout(timer); reject(error); } });
    child.once('close', (code, signal) => { if (!settled) { settled = true; clearTimeout(timer); resolve({ code, signal, stdout, stderr }); } });
  });
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
    const parent = await db.get(`SELECT a.id, a.name, a.name_meaning, a.agent_type, a.workspace_id, a.fleet_id, a.model_tier,
      a.language, a.isolation_mode, a.current_task, w.path AS workspace_root
      FROM agents a JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ? AND a.execution_mode = 'orchestrator'`, context.orchestratorId);
    if (!parent) return { success: false, error: `Orchestrator '${context.orchestratorId}' not found or has no workspace.` };
    await agentAuthority.requireOrchestrator(db, parent.id);
    const reproductionGuard = await enforceReproductionLimits(db, parent.id, context);
    if (!reproductionGuard.allowed) return { success: false, ...reproductionGuard };
    const id = 'worker_fork_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await db.run(
      "INSERT INTO agents (id, name, name_meaning, role, status, agent_type, execution_mode, workspace_id, fleet_id, model_tier, language, isolation_mode, parent_agent_id, lineage_relation, current_task) VALUES (?, ?, ?, 'worker', 'idle', ?, 'worker', ?, ?, ?, ?, ?, ?, 'fork', ?)",
      id, 'Forked Worker of ' + context.orchestratorId, parent.name_meaning || `Fork identity of ${parent.name || context.orchestratorId}`, parent.agent_type || 'GenOS', parent.workspace_id, parent.fleet_id,
      parent.model_tier || 'standard', parent.language || 'TypeScript', parent.isolation_mode || 'Branch', context.orchestratorId,
      context.mission || 'strategy_fork'
    );
    await agentEvolution.recordWorkerLineage(db, {
      agentId: id,
      name: 'Forked Worker of ' + context.orchestratorId,
      role: context.role || 'worker',
      workspaceId: parent.workspace_id
    }, {
      parentId: context.orchestratorId,
      edgeType: 'fork'
    }).catch(() => {});
    const slot = await workerGarage.reserveSlot(db, {
      orchestratorId: context.orchestratorId,
      workerId: id,
      name: 'Forked Worker of ' + context.orchestratorId,
      role: context.role || 'worker',
      mission: context.mission || 'strategy_fork'
    });
    const agentWorkspaceLifecycle = require('../agentWorkspaceLifecycleService');
    const workerWorkspaceRoot = await agentWorkspaceLifecycle.createIsolatedWorkspace(parent.workspace_root, id, context.capsuleRoot);
    
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
    return { success: true, forkedWorkerId: id, slot: slot.slot, status: 'queued' };
  } catch (error) {
    return { success: false, error: 'Fork failed: ' + error.message };
  }
}

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

async function enforceReproductionLimits(db, parentId, context = {}) {
  const requestedDepth = Number(context.maxDepth || context.max_depth || DEFAULT_HAYFLICK_MAX_DEPTH);
  const requestedBuds = Number(context.maxBuds || context.max_buds || context.hayflickLimit || DEFAULT_HAYFLICK_MAX_BUDS);
  const maxDepth = Number.isFinite(requestedDepth) ? Math.max(1, Math.min(HARD_HAYFLICK_MAX_DEPTH, Math.floor(requestedDepth))) : DEFAULT_HAYFLICK_MAX_DEPTH;
  const maxBuds = Number.isFinite(requestedBuds) ? Math.max(1, Math.min(HARD_HAYFLICK_MAX_BUDS, Math.floor(requestedBuds))) : DEFAULT_HAYFLICK_MAX_BUDS;
  const currentDepth = await getLineageDepth(db, parentId);
  const childCountRow = await db.get('SELECT COUNT(*) as count FROM agents WHERE parent_agent_id = ?', parentId);
  const currentBuds = Number(childCountRow?.count || 0);
  if (currentDepth >= maxDepth || currentBuds >= maxBuds) {
    return {
      allowed: false,
      blockedByHayflick: true,
      error: currentDepth >= maxDepth
        ? `Hayflick limit reached: lineage depth ${currentDepth} reaches or exceeds maximum allowed depth ${maxDepth}. Reproduction blocked to prevent spawn storms.`
        : `Hayflick limit reached: parent agent '${parentId}' has accumulated ${currentBuds} buds (limit ${maxBuds}). Reproduction blocked.`,
      currentDepth,
      maxDepth,
      currentBuds,
      maxBuds
    };
  }
  return { allowed: true, currentDepth, maxDepth, currentBuds, maxBuds };
}

async function recursiveFork(context = {}) {
  const orchestratorId = context.orchestratorId || context.agentId;
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

    // Delegate to standard fork
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
  const workspaceId = context.workspaceId || context.agent_id;
  if (workspaceId && (Array.isArray(context.snapshotHistory) || context.testCommand || context.bugTrigger)) {
    if (context.predicate !== undefined && typeof context.predicate !== 'function') {
      return { success: false, error: 'predicate must be a function when supplied in-process.' };
    }
    const db = await getDatabase();
    const res = await bisectService.autoBisectWorkspaceAnomaly(db, {
      workspaceId,
      workspaceRoot: context.workspaceRoot,
      testCommand: context.testCommand || 'npm test',
      snapshotHistory: Array.isArray(context.snapshotHistory) ? context.snapshotHistory : null,
      predicate: context.predicate || null,
      timeoutMs: context.timeoutMs,
      autoRollback: context.autoRollback !== false
    });
    return { success: true, bisectionResult: res };
  }
  return { success: false, error: 'workspaceId and snapshotHistory, testCommand, or bugTrigger required for bisection.' };
}

function entropyCheck(context) {
  if (!context || !Array.isArray(context.actionHistory) || context.actionHistory.length === 0) {
    return { success: false, error: 'actionHistory required for entropy check.' };
  }
  const swarmMetricsService = require('../swarmMetricsService');
  const metrics = swarmMetricsService.calculateShannonEntropy(context.actionHistory);
  return {
    success: true,
    entropy: metrics.rawEntropy,
    normalizedEntropy: metrics.normalizedEntropy,
    cognitiveDriftState: metrics.cognitiveDriftState,
    diagnosticRecommendation: metrics.diagnosticRecommendation,
    samples: metrics.sampleSize,
    uniqueActions: metrics.uniqueActionCount,
    isPeriodicCycle: metrics.isPeriodicCycle
  };
}

async function evaluate(context) {
  try {
    const threshold = Number.isFinite(context.threshold) ? Number(context.threshold) : 0.20;
    const evalResult = await evaluation.runImpossibleBench({ task: context.task || 'test' });
    const isGood = evalResult.brierScore < threshold;
    return { success: isGood, brierScore: evalResult.brierScore, metrics: evalResult };
  } catch (err) {
    return { success: false, status: 'incomplete', code: err.code || 'EVALUATION_FAILED', error: err.message, runId: err.runId || null };
  }
}

async function verify(context) {
  let domainVerified = true;
  let testResults = null;
  let invariantResults = [];
  let failures = [];
  let success = true;

  if (context.testCommand && context.workspaceId) {
    const db = await getDatabase();
    const workspace = await scopedWorkspace(db, context.workspaceId);
    if (!workspace) {
      success = false;
      domainVerified = false;
      failures.push(`Workspace not found: ${context.workspaceId}`);
    } else {
      try {
        const result = await runBoundedTestCommand(context.testCommand, workspace.path);
        testResults = { passed: result.code === 0, output: result.stdout || result.stderr, signal: result.signal };
        if (result.code !== 0) {
          success = false;
          domainVerified = false;
          failures.push(`Test command failed: ${context.testCommand}`);
        }
      } catch (err) {
        success = false;
        domainVerified = false;
        testResults = { passed: false, output: err.stdout || err.stderr || err.message };
        failures.push(`Test command failed: ${context.testCommand}`);
      }
    }
  }

  if (Array.isArray(context.invariants)) {
    if (!Array.isArray(context.invariantResults) || context.invariantResults.length !== context.invariants.length) {
      success = false;
      domainVerified = false;
      failures.push('Invariant results are required; invariants are never assumed to pass.');
    } else {
      invariantResults = context.invariants.map((invariant, index) => ({
        invariant,
        passed: context.invariantResults[index] === true || context.invariantResults[index]?.passed === true
      }));
      if (invariantResults.some((result) => !result.passed)) {
        success = false;
        domainVerified = false;
        failures.push('One or more invariants failed.');
      }
    }
  }

  if (Array.isArray(context.requiredArtifacts) && context.workspaceId) {
    const fs = require('fs');
    const path = require('path');
    const db = await getDatabase();
    const workspace = await scopedWorkspace(db, context.workspaceId);
    if (workspace) {
      for (const artifact of context.requiredArtifacts) {
        let fullPath;
        try { fullPath = resolveContainedPath(workspace.path, artifact, 'required artifact'); }
        catch (_) {
          success = false;
          domainVerified = false;
          failures.push(`Unsafe required artifact path: ${artifact}`);
          continue;
        }
         if (!fs.existsSync(fullPath)) {
            success = false;
            domainVerified = false;
            failures.push(`Missing required artifact: ${artifact}`);
         }
      }
    }
  }
  
  return { success, domainVerified, testResults, invariantResults, failures };
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

async function worktreeCleanup(context) {
  const wsMod = require('../agentWorkspaceLifecycleService');
  const db = await getDatabase();
  const count = await wsMod.reconcileWorkspaceCleanup(db);
  return { success: true, count, detail: `Scheduled ${count} workspaces for cleanup.` };
}

async function casGc(context) {
  return { success: false, code: 'PRIMITIVE_UNIMPLEMENTED', error: 'CAS garbage collection is not implemented.' };
}

async function dagMarkSweep(context) {
  return { success: false, code: 'PRIMITIVE_UNIMPLEMENTED', error: 'DAG mark and sweep is not implemented.' };
}

module.exports = {
  snapshot,
  fork,
  recursiveFork,
  enforceReproductionLimits,
  slmRoute,
  bisectAgent,
  entropyCheck,
  evaluate,
  verify,
  vfsDryRun,
  safeRevert,
  run,
  cryptobiosisFreeze,
  cryptobiosisThaw,
  worktreeCleanup,
  casGc,
  dagMarkSweep
  ,runBoundedTestCommand
};
