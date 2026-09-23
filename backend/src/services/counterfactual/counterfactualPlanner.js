'use strict';

const crypto = require('crypto');
const { COUNTERFACTUAL_TYPES, generateIntervention, calculateBlastRadius } = require('./interventions');
const { executeVfsExperiment } = require('./experiments');
const { compareEffects } = require('./comparison');
const { promoteWinner } = require('./promotion');

const WORLD_STATUS = Object.freeze({
  DRAFT: 'draft', SEALED: 'sealed', RUNNING: 'running',
  EVALUATED: 'evaluated', PROMOTED: 'promoted', DISCARDED: 'discarded',
});

const EXPERIMENT_STATUS = Object.freeze({
  PLANNED: 'planned', RUNNING: 'running',
  COMPLETED: 'completed', FAILED: 'failed', ABORTED: 'aborted',
});

const MAX_EXPERIMENT_MS = 300000;
const MAX_WORLDS_DEFAULT = 8;

function uuid() { return crypto.randomUUID(); }
function nowIso() { return new Date().toISOString(); }
function worldId() { return 'cfw_' + uuid(); }
function experimentId() { return 'cfe_' + uuid(); }
function vfsNs(id) { return 'vfs_cf_' + id; }

const WORLD_REGISTRY = new Map();
const EXPERIMENT_REGISTRY = new Map();

async function snapshotProduction(ctx) {
  const { db, agentId, reason } = ctx;
  const snapshotId = 'snap_cf_' + uuid();
  const stateJson = JSON.stringify({
    timestamp: Date.now(), source: 'counterfactual_planner',
    agentId: agentId || 'collective', reason: reason || 'counterfactual_fork',
    morphologyVersion: ctx.morphologyVersion || 0, topology: ctx.topology || {},
  });
  if (db) {
    await db.run(
      `INSERT INTO agent_state_snapshots (id, agent_id, workspace_id, state_json, reason, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [snapshotId, agentId || 'collective', ctx.workspaceId || null,
       stateJson, reason || 'counterfactual_fork', 'counterfactual_planner']);
  }
  return snapshotId;
}

async function persistWorld(db, world) {
  if (db) {
    await db.run(
      `INSERT INTO counterfactual_worlds
       (id, parent_world_id, base_snapshot_id, label, counterfactual_type,
        intervention_json, vfs_namespace, blast_radius_risk, causal_locus,
        status, expected_benefit, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [world.id, world.parent_world_id, world.base_snapshot_id, world.label,
       world.counterfactual_type, world.intervention_json, world.vfs_namespace,
       world.blast_radius_risk, world.causal_locus, world.status,
       world.expected_benefit, world.created_by, world.created_at]);
  }
}

async function forkWorlds(ctx) {
  const { db, baseSnapshotId, types } = ctx;
  const targetTypes = (types || COUNTERFACTUAL_TYPES).slice(0, MAX_WORLDS_DEFAULT);
  const worlds = [];
  for (const cfType of targetTypes) {
    const intervention = generateIntervention(cfType, ctx);
    if (!intervention) continue;
    const id = worldId();
    const world = {
      id, parent_world_id: null, base_snapshot_id: baseSnapshotId,
      label: 'counterfactual_' + cfType + '_' + Date.now(),
      counterfactual_type: cfType,
      intervention_json: JSON.stringify(intervention),
      vfs_namespace: vfsNs(id),
      blast_radius_risk: calculateBlastRadius(intervention),
      causal_locus: intervention.field,
      status: WORLD_STATUS.DRAFT,
      expected_benefit: ctx.expectedDelta || 0.15,
      created_by: 'counterfactual_planner',
      created_at: nowIso(),
    };
    await persistWorld(db, world);
    WORLD_REGISTRY.set(id, world);
    worlds.push(world);
  }
  return worlds;
}

async function sealWorld(id, db) {
  const world = WORLD_REGISTRY.get(id);
  if (!world) throw new Error('World not found: ' + id);
  world.status = WORLD_STATUS.SEALED;
  world.sealed_at = nowIso();
  if (db) {
    await db.run(`UPDATE counterfactual_worlds SET status = ?, sealed_at = ? WHERE id = ?`,
      [WORLD_STATUS.SEALED, world.sealed_at, id]);
  }
  return world;
}

async function persistExperiment(db, experiment) {
  if (db) {
    await db.run(
      `INSERT INTO counterfactual_experiments
       (id, world_id, experiment_label, protocol_json, budget_json,
        metrics_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [experiment.id, experiment.world_id, experiment.experiment_label,
       experiment.protocol_json, experiment.budget_json, experiment.metrics_json,
       experiment.status, experiment.created_at]);
  }
}

async function executeExperimentAttempt(db, experiment, world) {
  const t0 = Date.now();
  const metrics = await executeVfsExperiment(world);
  experiment.duration_ms = Date.now() - t0;
  experiment.metrics_json = JSON.stringify(metrics);
  experiment.status = EXPERIMENT_STATUS.COMPLETED;
  experiment.completed_at = nowIso();
  experiment.receipt_json = JSON.stringify({
    worldId: world.id, type: world.counterfactual_type,
    durationMs: experiment.duration_ms, metrics,
    timestamp: experiment.completed_at,
  });
}

async function runExperiment(db, world) {
  const id = experimentId();
  const experiment = {
    id, world_id: world.id,
    experiment_label: world.counterfactual_type + '_experiment',
    protocol_json: '{}', budget_json: '{}', metrics_json: '{}',
    status: EXPERIMENT_STATUS.PLANNED,
    started_at: null, completed_at: null, duration_ms: null,
    abort_reason: null, receipt_json: '{}',
    created_at: nowIso(),
  };
  await persistExperiment(db, experiment);
  experiment.status = EXPERIMENT_STATUS.RUNNING;
  experiment.started_at = nowIso();
  if (db) await db.run(`UPDATE counterfactual_experiments SET status = ?, started_at = ? WHERE id = ?`,
    [EXPERIMENT_STATUS.RUNNING, experiment.started_at, id]);
  try {
    await executeExperimentAttempt(db, experiment, world);
  } catch (err) {
    experiment.status = EXPERIMENT_STATUS.FAILED;
    experiment.abort_reason = err.message;
    experiment.completed_at = nowIso();
    experiment.duration_ms = 0;
  }
  if (db) {
    await db.run(
      `UPDATE counterfactual_experiments
       SET status = ?, completed_at = ?, duration_ms = ?,
           metrics_json = ?, receipt_json = ?, abort_reason = ?
       WHERE id = ?`,
      [experiment.status, experiment.completed_at, experiment.duration_ms,
       experiment.metrics_json, experiment.receipt_json,
       experiment.abort_reason, id]);
  }
  EXPERIMENT_REGISTRY.set(id, experiment);
  return experiment;
}

function sealAllWorlds(worlds, db) {
  const promises = worlds.map(world => sealWorld(world.id, db));
  return Promise.all(promises);
}

function snapshotCtx(db, agentId, collectiveState) {
  return {
    db, agentId, reason: 'counterfactual_lifecycle',
    morphologyVersion: collectiveState ? collectiveState.currentMorphologyVersion : 0,
    topology: collectiveState ? collectiveState.topologyState : {},
  };
}

function winnerPayload(winner) {
  const wWorld = winner ? WORLD_REGISTRY.get(winner.world_id) : null;
  return winner ? {
    worldId: winner.world_id,
    type: wWorld ? wWorld.counterfactual_type : null,
    normalizedEffect: winner.normalized_effect,
    confidence: winner.confidence,
  } : null;
}

function promotionPayload(promotion) {
  return promotion.promoted
    ? { worldId: promotion.worldId, planId: promotion.plan ? promotion.plan.id : null }
    : null;
}

async function runCounterfactualLifecycle(ctx) {
  const { db, collectiveState, agentId, types } = ctx;
  if (!agentId && !collectiveState) {
    return { executed: false, reason: 'invalid_context' };
  }
  const startTime = Date.now();
  const baseSnapshotId = await snapshotProduction(snapshotCtx(db, agentId, collectiveState));
  const worlds = await forkWorlds({ db, agentId, baseSnapshotId, types, ...ctx });
  if (worlds.length === 0) {
    return { executed: false, reason: 'no_worlds_forked', baseSnapshotId };
  }
  await sealAllWorlds(worlds, db);
  const experiments = [];
  for (const world of worlds) {
    const exp = await runExperiment(db, world);
    experiments.push(exp);
  }
  const comparison = await compareEffects({
    db, worldRegistry: WORLD_REGISTRY, experimentRegistry: EXPERIMENT_REGISTRY,
    baselineWorldId: worlds[0] ? worlds[0].id : null,
  });
  const promotion = await promoteWinner({
    db, collectiveState, winner: comparison.winner, worldRegistry: WORLD_REGISTRY,
  });
  const duration = Date.now() - startTime;
  return {
    lifecycleId: 'cf_lifecycle_' + uuid(), executed: true, durationMs: duration,
    baseSnapshotId, worldsCreated: worlds.length,
    experimentsRun: experiments.length,
    winner: winnerPayload(comparison.winner),
    promotion: promotionPayload(promotion),
    timestamp: nowIso(),
  };
}

function getWorld(id) { return WORLD_REGISTRY.get(id); }
function listWorlds(f) {
  let w = Array.from(WORLD_REGISTRY.values());
  if (f && f.status) w = w.filter(x => x.status === f.status);
  if (f && f.type) w = w.filter(x => x.counterfactual_type === f.type);
  return w;
}
function getExperiment(id) { return EXPERIMENT_REGISTRY.get(id); }
function listExperiments(f) {
  let e = Array.from(EXPERIMENT_REGISTRY.values());
  if (f && f.worldId) e = e.filter(x => x.world_id === f.worldId);
  if (f && f.status) e = e.filter(x => x.status === f.status);
  return e;
}

function getStats() {
  const w = Array.from(WORLD_REGISTRY.values());
  const e = Array.from(EXPERIMENT_REGISTRY.values());
  return {
    totalWorlds: w.length, totalExperiments: e.length,
    promotedWorlds: w.filter(x => x.status === WORLD_STATUS.PROMOTED).length,
    discardedWorlds: w.filter(x => x.status === WORLD_STATUS.DISCARDED).length,
    worldsByType: COUNTERFACTUAL_TYPES.reduce((a, t) => {
      a[t] = w.filter(x => x.counterfactual_type === t).length; return a;
    }, {}),
  };
}

module.exports = {
  runCounterfactualLifecycle, forkWorlds, sealWorld, snapshotProductionState: snapshotProduction,
  runExperiment, compareEffects, promoteWinner,
  getWorld, listWorlds, getExperiment, listExperiments, getStats,
  COUNTERFACTUAL_TYPES, WORLD_STATUS, EXPERIMENT_STATUS,
  MAX_EXPERIMENT_MS, MAX_WORLDS_DEFAULT,
};
