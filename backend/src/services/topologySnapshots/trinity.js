'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { hashWorkspace } = require('../trinitySnapshotService');
const { digest, refusal } = require('../topologySnapshotContract');

const HASH = /^[a-f0-9]{64}$/;
const TERMINAL = new Set(['promoted', 'rejected', 'escalated', 'promotion_failed']);
const VARIANT_STAGES = Object.freeze({
  controlled: [], heterogeneous: [], adversarial: ['adversarial', 'cross_examination'],
  counterfactual: ['comparison'], factorial: ['comparison'],
  pareto: ['comparison'], jury: ['jury'], recursive: ['recursive'],
  adaptive: ['adaptive'], temporal: ['comparison'], oracular: ['comparison'],
  exploratory: ['qd']
});

function fail(code, message) { throw refusal(code, message); }

function samePath(left, right) {
  if (!left || !right) return false;
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function parseObject(value, label) {
  let parsed;
  try { parsed = JSON.parse(value); } catch (_) { fail('TRINITY_SNAPSHOT_CORRUPT', `${label} is invalid JSON.`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('TRINITY_SNAPSHOT_CORRUPT', `${label} is not an object.`);
  }
  return parsed;
}

async function tableExists(db, name) {
  const row = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name);
  return Boolean(row);
}

async function loadBoundState(context) {
  const { db, sessionId, agentId, workspaceId, scope } = context;
  if (typeof scope?.clause !== 'string' || !Array.isArray(scope.params)) {
    fail('TRINITY_SNAPSHOT_SCOPE_REQUIRED', 'A tenant workspace scope is required.');
  }
  const experiment = await db.get('SELECT * FROM trinity_experiments WHERE id = ?', sessionId);
  if (!experiment) fail('TRINITY_SNAPSHOT_UNKNOWN', 'Trinity experiment was not found.');
  const world = await db.get('SELECT * FROM trinity_worlds WHERE experiment_id = ? AND agent_id = ?', sessionId, agentId);
  const agent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  const workspace = await db.get(`SELECT w.path FROM workspaces w WHERE w.id = ? AND ${scope.clause}`,
    workspaceId, ...scope.params);
  if (!world || agent?.workspace_id !== workspaceId || !samePath(world.workspace_root, workspace?.path)) {
    fail('TRINITY_SNAPSHOT_OWNER_MISMATCH', 'Agent is not bound to this Trinity world and workspace.');
  }
  if (world.snapshot_hash !== experiment.mission_snapshot_hash || !HASH.test(String(world.snapshot_hash))) {
    fail('TRINITY_SNAPSHOT_BASELINE_MISMATCH', 'World does not reference the sealed baseline.');
  }
  return { experiment, world };
}

function selectedVariant(design, requested) {
  const selection = design.variantSelection || {};
  const selected = selection.variant === 'composed' ? selection.selectedPreset : selection.variant || 'controlled';
  const normalized = requested === 'default' ? 'controlled' : requested;
  if (selected !== normalized || !Object.hasOwn(VARIANT_STAGES, selected)) {
    fail('TRINITY_SNAPSHOT_VARIANT_MISMATCH', 'Persisted Trinity variant does not match the snapshot request.');
  }
  const variants = require('../trinityVariantService');
  const expected = variants.compileExperimentalDesign(variants.DEFINITIONS[selected].design).design;
  if (digest(selection.experimentalDesign) !== digest(expected)) {
    fail('TRINITY_SNAPSHOT_DESIGN_MISMATCH', 'Persisted Trinity experimental design differs from its selected preset.');
  }
  return selected;
}

async function verifiedBaseline(experiment, design) {
  const root = design.snapshotRoot;
  const parent = root && path.dirname(root);
  if (typeof root !== 'string' || path.basename(root) !== experiment.mission_id
    || path.basename(parent) !== 'trinity-snapshots'
    || path.basename(path.dirname(parent)) !== '.genos-agent-worlds') {
    fail('TRINITY_SNAPSHOT_BASELINE_PATH', 'Sealed baseline path is not bound to this mission.');
  }
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    fail('TRINITY_SNAPSHOT_BASELINE_PATH', 'Sealed baseline is not a regular directory.');
  }
  const actual = await hashWorkspace(root);
  if (actual !== experiment.mission_snapshot_hash) {
    fail('TRINITY_SNAPSHOT_BASELINE_MISMATCH', 'Sealed baseline contents changed.');
  }
  return { missionId: experiment.mission_id, sha256: actual };
}

async function journalRefs(db, missionId) {
  if (!await tableExists(db, 'trinity_runtime_journal')) return [];
  const rows = await db.all('SELECT stage, input_hash, value_json FROM trinity_runtime_journal WHERE mission_id = ? ORDER BY stage', missionId);
  return rows.map((row) => {
    const value = parseObject(row.value_json, `Trinity journal ${row.stage}`);
    if (!HASH.test(String(row.input_hash)) || !HASH.test(String(value.digest))
      || digest(value.value) !== value.digest || digest(value.trace) !== value.traceDigest) {
      fail('TRINITY_SNAPSHOT_JOURNAL_CORRUPT', `Trinity journal ${row.stage} failed integrity checks.`);
    }
    return { stage: row.stage, inputHash: row.input_hash, valueHash: value.digest, traceHash: value.traceDigest };
  });
}

async function transitionRef(db, experimentId) {
  const row = await db.get('SELECT MAX(id) AS last_id, COUNT(*) AS count FROM trinity_experiment_transitions WHERE experiment_id = ?', experimentId);
  return { lastId: row?.last_id ?? null, count: Number(row?.count || 0) };
}

async function worldsRef(db, experiment) {
  const rows = await db.all('SELECT id, world_number, agent_id, snapshot_hash, workspace_root, status FROM trinity_worlds WHERE experiment_id = ? ORDER BY world_number, id', experiment.id);
  const roots = new Set(rows.map((row) => path.resolve(row.workspace_root || '')));
  if (roots.size !== rows.length || rows.some((row) => row.snapshot_hash !== experiment.mission_snapshot_hash)) {
    fail('TRINITY_SNAPSHOT_WORLDS_CONFLICT', 'Trinity worlds have conflicting workspace or baseline bindings.');
  }
  return { count: rows.length, stateHash: digest(rows) };
}

function optionalDigest(value) { return value == null ? null : digest(value); }

function variantInputs(input) {
  const { variant, design, worlds, baseline, budgetHash } = input;
  const selection = design.variantSelection || {};
  const policy = selection.experimentalDesign || {};
  const fields = {
    controlled: { expectedWorlds: 3, sharedStartHash: baseline.sha256 },
    heterogeneous: { modelAssignmentsHash: optionalDigest(selection.worldModelAssignments), diversityPolicy: policy.diversityPolicy },
    adversarial: { interactionPolicy: policy.interactionPolicy, sealedStartHash: baseline.sha256 },
    counterfactual: { hypothesisPolicy: policy.hypothesisPolicy, interventionDesignHash: optionalDigest(design.hypotheses) },
    factorial: { expectedWorlds: 16, assignmentsHash: optionalDigest(selection.worldModelAssignments) },
    pareto: { objectivePolicy: policy.objectivePolicy, comparisonDesignHash: optionalDigest(design.objectiveProfiles) },
    jury: { adjudicationPolicy: policy.adjudicationPolicy, juryConfigHash: optionalDigest(design.juryConfig) },
    recursive: { recursionStateHash: optionalDigest(selection.recursiveState), budgetTokens: selection.recursiveBudgetTokens ?? null },
    adaptive: { budgetPolicyHash: budgetHash, continuationConfigHash: optionalDigest(selection.adaptiveBudgetConfig) },
    temporal: { temporalPolicy: policy.temporalPolicy, horizonDesignHash: optionalDigest(design.temporalHorizons) },
    oracular: { worldTopology: policy.worldTopology, predictionPolicy: policy.hypothesisPolicy },
    exploratory: { qdConfigHash: optionalDigest(selection.qdConfig), replicationPolicy: policy.replicationPolicy }
  };
  return Object.fromEntries(Object.entries({ ...fields[variant], observedWorlds: worlds.count })
    .map(([key, value]) => [key, value === undefined ? null : value]));
}

function variantComponent(input) {
  const { variant, design, journal, worlds, baseline, budgetHash } = input;
  const selection = design.variantSelection || {};
  const stages = VARIANT_STAGES[variant];
  return { id: 'variant-policy', status: 'captured', payload: {
    variant, designId: selection.experimentalDesignId || null,
    experimentalDesign: selection.experimentalDesign || null,
    requiredAdapters: selection.requiredAdapters || [],
    inputs: variantInputs({ variant, design, worlds, baseline, budgetHash }),
    stages: stages.map((stage) => ({ stage, recorded: journal.some((item) => item.stage === stage) }))
  } };
}

async function capture(context) {
  const { experiment, world } = await loadBoundState(context);
  const design = parseObject(experiment.design_json, 'Trinity design');
  const variant = selectedVariant(design, context.variantId);
  const baseline = await verifiedBaseline(experiment, design);
  const budgetHash = digest(parseObject(experiment.budget_policy_json, 'Trinity budget policy'));
  const journal = await journalRefs(context.db, experiment.mission_id);
  const transition = await transitionRef(context.db, experiment.id);
  const worlds = await worldsRef(context.db, experiment);
  const current = await context.db.get('SELECT status, updated_at FROM trinity_experiments WHERE id = ?', experiment.id);
  if (current?.status !== experiment.status || current.updated_at !== experiment.updated_at) {
    fail('TRINITY_SNAPSHOT_CONCURRENT_CHANGE', 'Trinity experiment changed during capture.');
  }
  return { policyVersion: 1, boundary: {
    experimentId: experiment.id, status: experiment.status, updatedAt: experiment.updated_at,
    transition, worldId: world.id, worldStatus: world.status,
    worlds, journalStages: journal.map((item) => item.stage)
  }, components: [
    { id: 'sealed-baseline', status: 'captured', payload: baseline },
    { id: 'world-binding', status: 'captured', payload: {
      worldId: world.id, agentId: world.agent_id, workspaceId: context.workspaceId,
      worldNumber: world.world_number, status: world.status, snapshotHash: world.snapshot_hash
    } },
    { id: 'experiment', status: 'reference-only', reference: {
      experimentId: experiment.id, status: experiment.status, transition,
      decisionHash: experiment.decision_json ? digest(parseObject(experiment.decision_json, 'Trinity decision')) : null
    } },
    { id: 'phase-journal', status: 'reference-only', reference: { missionId: experiment.mission_id, entries: journal } },
    variantComponent({ variant, design, journal, worlds, baseline, budgetHash })
  ] };
}

async function preflightRestore(context, manifest) {
  const status = manifest?.boundary?.status;
  if (!TERMINAL.has(status)) return { ok: false, reasons: ['Trinity experiment is not terminal; live worlds may still write.'] };
  const variant = context.variantId === 'default' ? 'controlled' : context.variantId;
  const policy = manifest.components.find((item) => item.id === 'variant-policy')?.payload;
  if (policy?.variant !== variant) return { ok: false, reasons: ['Trinity variant policy changed.'] };
  return { ok: true, plan: { restore: 'workspace-only', collectiveState: 'verify-only',
    sealedBaseline: 'verify-sha256', experimentId: context.sessionId } };
}

module.exports = { capture, preflightRestore, VARIANT_STAGES };
