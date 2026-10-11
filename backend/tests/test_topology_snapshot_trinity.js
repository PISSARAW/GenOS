'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const adapter = require('../src/services/topologySnapshots/trinity');
const topologySnapshots = require('../src/services/topologySnapshotService');
const { hashWorkspace } = require('../src/services/trinitySnapshotService');
const variantService = require('../src/services/trinityVariantService');

topologySnapshots.registerAdapter('trinity', adapter);

function selectionFor(variant, automatic) {
  const selection = { variant: automatic ? 'composed' : variant,
    experimentalDesignId: 'design-1',
    experimentalDesign: variantService.compileExperimentalDesign(variantService.DEFINITIONS[variant].design).design,
    requiredAdapters: [] };
  if (automatic) selection.selectedPreset = variant;
  return selection;
}

async function fixture(variant = 'controlled', status = 'promoted', automatic = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-trinity-snapshot-'));
  const baseline = path.join(root, '.genos-agent-worlds', 'trinity-snapshots', 'mission-1');
  const workspace = path.join(root, 'world-1');
  await fs.mkdir(baseline, { recursive: true });
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(baseline, 'source.txt'), 'sealed input');
  const hash = await hashWorkspace(baseline);
  const experiment = { id: 'mission-1', mission_id: 'mission-1', mission_snapshot_hash: hash,
    status, updated_at: '2026-10-10T00:00:00Z', decision_json: null, budget_policy_json: '{}',
    design_json: JSON.stringify({ snapshotRoot: baseline, variantSelection: selectionFor(variant, automatic) }) };
  const world = { id: 'world-1', agent_id: 'agent-1', experiment_id: experiment.id,
    workspace_root: workspace, snapshot_hash: hash, world_number: 1, status: 'complete' };
  const db = {
    async get(sql, ...args) {
      if (sql.includes('FROM trinity_experiments')) return sql.includes('SELECT status')
        ? { status: experiment.status, updated_at: experiment.updated_at } : experiment;
      if (sql.includes('FROM trinity_worlds')) return args[1] === world.agent_id ? world : null;
      if (sql.includes('FROM agents')) return { workspace_id: 'workspace-1' };
      if (sql.includes('FROM workspaces')) return { path: workspace };
      if (sql.includes('sqlite_master')) return null;
      if (sql.includes('FROM trinity_experiment_transitions')) return { last_id: 1, count: 1 };
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async all(sql) {
      if (sql.includes('FROM trinity_worlds')) return [world];
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const context = { db, topologyId: 'trinity', variantId: variant, sessionId: experiment.id,
    agentId: world.agent_id, workspaceId: 'workspace-1',
    scope: { clause: 'w.organization_id IS NULL AND w.project_id IS NULL', params: [] } };
  return { root, baseline, context, experiment };
}

test('Trinity captures a verified baseline and policy for all twelve variants', async () => {
  for (const variant of Object.keys(adapter.VARIANT_STAGES)) {
    const data = await fixture(variant);
    try {
      const captured = await adapter.capture(data.context);
      assert.equal(captured.components.find((item) => item.id === 'sealed-baseline').payload.sha256,
        data.experiment.mission_snapshot_hash);
      assert.equal(captured.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
      const preflight = await adapter.preflightRestore(data.context, captured);
      assert.equal(preflight.ok, true);
      assert.equal(preflight.plan.collectiveState, 'verify-only');
      const sealed = await topologySnapshots.capture(data.context);
      assert.equal((await topologySnapshots.preflightRestore({ ...data.context, manifest: sealed })).restorable,
        false);
    } finally { await fs.rm(data.root, { recursive: true, force: true }); }
  }
});

test('Trinity refuses capture for an agent outside the experiment world', async () => {
  const data = await fixture();
  try {
    data.context.agentId = 'other-agent';
    await assert.rejects(adapter.capture(data.context), { code: 'TRINITY_SNAPSHOT_OWNER_MISMATCH' });
  } finally { await fs.rm(data.root, { recursive: true, force: true }); }
});

test('Trinity refuses a changed sealed baseline', async () => {
  const data = await fixture();
  try {
    await fs.writeFile(path.join(data.baseline, 'source.txt'), 'changed input');
    await assert.rejects(adapter.capture(data.context), { code: 'TRINITY_SNAPSHOT_BASELINE_MISMATCH' });
  } finally { await fs.rm(data.root, { recursive: true, force: true }); }
});

test('Trinity refuses workspace restore while the experiment is active', async () => {
  const data = await fixture('controlled', 'sealed_running');
  try {
    const captured = await adapter.capture(data.context);
    const preflight = await adapter.preflightRestore(data.context, captured);
    assert.equal(preflight.ok, false);
  } finally { await fs.rm(data.root, { recursive: true, force: true }); }
});

test('Trinity binds every automatically selected preset to its verified design', async () => {
  for (const variant of Object.keys(adapter.VARIANT_STAGES)) {
    const data = await fixture(variant, 'promoted', variant !== 'controlled');
    try {
      const sealed = await topologySnapshots.capture(data.context);
      assert.equal(sealed.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
      assert.equal((await topologySnapshots.preflightRestore({ ...data.context, manifest: sealed })).allowed, true);
    } finally { await fs.rm(data.root, { recursive: true, force: true }); }
  }
});

test('Trinity rejects a selected preset whose persisted design changed', async () => {
  const data = await fixture('heterogeneous', 'promoted', true);
  try {
    const design = JSON.parse(data.experiment.design_json);
    design.variantSelection.experimentalDesign.diversityPolicy = 'strategy_controlled';
    data.experiment.design_json = JSON.stringify(design);
    await assert.rejects(adapter.capture(data.context), { code: 'TRINITY_SNAPSHOT_DESIGN_MISMATCH' });
  } finally { await fs.rm(data.root, { recursive: true, force: true }); }
});
