'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const adapter = require('../src/services/topologySnapshots/biome');
const snapshots = require('../src/services/topologySnapshotService');
const variants = require('../src/services/biome/variants/variantPolicyService');
const { digest } = require('../src/services/topologySnapshotContract');

snapshots.registerAdapter('biome', adapter);

function fixture(variant = 'resource') {
  const state = {
    biomeId: 'biome-1', revision: 2, scope: variant === 'persistent' ? 'persistent' : 'mission',
    variant, variantPolicy: variants.resolve(variant), variantSelection: { variant, method: 'explicit' },
    variantState: { seasons: [{ season: 1 }], armsRace: {} },
    persistenceKey: variant === 'persistent' ? 'environment-1' : null,
    persistenceRevision: variant === 'persistent' ? 3 : null,
    ecology: { biomeId: 'biome-1', missionId: 'biome-1', status: 'completed', tick: 2,
      environment: { environmentId: 'biome-1:environment', version: 2, sources: [] },
      ecologicalState: { runtime: { tick: 2, stopCondition: 'goal_achieved' } },
      niches: [{ nicheId: 'niche-1' }], populations: [{ populationId: 'population-1' }],
      interactionGraph: [], archive: [], resourcePool: { tokens: 20 }, opportunityMap: [] },
    matrix: { matrixId: 'biofilm-1', version: 2, entries: [['cycle:1', { key: 'cycle:1' }]], history: [] }
  };
  const events = [1, 2].map((revision) => ({ revision, event_type: 'ECOLOGICAL_CYCLE',
    payload_json: JSON.stringify({ actorId: 'agent-1', evidenceRefs: [`evidence-${revision}`] }) }));
  const identity = { workspace_id: 'workspace-1', status: 'completed',
    metadata_json: JSON.stringify({ topologySessionId: 'biome-1' }) };
  const persistent = { revision: 3, state_json: JSON.stringify({ ecology: { tick: 2 }, matrix: state.matrix }) };
  const db = {
    async get(sql) {
      if (sql.includes('FROM agents')) return identity;
      if (sql.includes('FROM workspaces')) return { id: 'workspace-1' };
      if (sql.includes('FROM topology_sessions')) return { state_json: JSON.stringify(state), revision: state.revision };
      if (sql.includes('FROM persistent_biome_environments')) return persistent;
      throw new Error(`Unexpected SQL: ${sql}`);
    },
    async all(sql) {
      if (sql.includes('FROM topology_session_events')) return events;
      throw new Error(`Unexpected SQL: ${sql}`);
    }
  };
  const context = { db, topologyId: 'biome', variantId: variant, sessionId: 'biome-1',
    agentId: 'agent-1', workspaceId: 'workspace-1',
    scope: { clause: 'w.organization_id IS NULL AND w.project_id IS NULL', params: [] } };
  return { state, events, identity, persistent, context };
}

test('all 11 Biome variants capture sealed, variant-specific manifests and preflight unchanged state', async () => {
  assert.equal(variants.list().length, 11);
  for (const variant of variants.list()) {
    const { context } = fixture(variant);
    const manifest = await snapshots.capture(context);
    assert.equal(manifest.bindings.variantId, variant);
    assert.equal(manifest.components.find((item) => item.id === 'variant-policy').payload.variant, variant);
    assert.equal(manifest.components.filter((item) => item.id === 'persistent-environment').length,
      variant === 'persistent' ? 1 : 0);
    assert.ok(manifest.components.filter((item) => item.status === 'reference-only')
      .every((item) => item.reference && !Object.hasOwn(item, 'payload')));
    const preflight = await snapshots.preflightRestore({ ...context, manifest });
    assert.equal(preflight.allowed, true);
    assert.equal(preflight.restorable, false);
    assert.equal(preflight.plan.type, 'verify-only');
  }
});

test('Biome refuses live ecology, foreign session identity and wrong variant', async () => {
  const sample = fixture();
  sample.state.ecology.status = 'active';
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_ACTIVE' });
  sample.state.ecology.status = 'completed';
  sample.identity.status = 'running';
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_ACTIVE' });
  sample.identity.status = 'completed';
  sample.identity.metadata_json = JSON.stringify({ topologySessionId: 'another-biome' });
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_OWNER_MISMATCH' });
  sample.identity.metadata_json = JSON.stringify({ topologySessionId: 'biome-1' });
  await assert.rejects(snapshots.capture({ ...sample.context, variantId: 'knowledge' }),
    { code: 'BIOME_SNAPSHOT_VARIANT_MISMATCH' });
});

test('Biome detects event gaps, environment conflict and state drift before restore', async () => {
  const sample = fixture('persistent');
  const manifest = await snapshots.capture(sample.context);
  sample.events.pop();
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_JOURNAL_GAP' });
  sample.events.push({ revision: 2, event_type: 'ECOLOGICAL_CYCLE', payload_json: '{}' });
  sample.persistent.revision = 4;
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_PERSISTENCE_CONFLICT' });
  sample.persistent.revision = 3;
  sample.state.ecology.resourcePool.tokens = 19;
  await assert.rejects(snapshots.preflightRestore({ ...sample.context, manifest }),
    { code: 'TOPOLOGY_SNAPSHOT_DRIFT' });
});

test('Biome refuses a forged tenant scope and snapshot binding', async () => {
  const sample = fixture();
  const manifest = await snapshots.capture(sample.context);
  await assert.rejects(snapshots.capture({ ...sample.context,
    scope: { clause: '1=1', params: [] } }), { code: 'BIOME_SNAPSHOT_SCOPE_INVALID' });
  await assert.rejects(snapshots.preflightRestore({ ...sample.context,
    workspaceId: 'workspace-2', manifest }), { code: 'TOPOLOGY_SNAPSHOT_OWNER_MISMATCH' });
});

test('Biome refuses unresolved external executions at a dormant boundary', async () => {
  const sample = fixture();
  sample.state.ecology.status = 'dormant';
  sample.state.ecology.ecologicalState.runtime.executions = { pending: { status: 'indeterminate' } };
  await assert.rejects(snapshots.capture(sample.context), { code: 'BIOME_SNAPSHOT_ACTIVE' });
});

test('Biome variant proof hashes fields actually produced by specialized controllers', async () => {
  const fields = { resource: 'recoveryBudgetReserve', exploration: 'noveltyArchive',
    quality_diversity: 'qualityDiversity', successional: 'transitions', resilience: 'resilienceEvents',
    persistent: 'seasons', open_ended: 'environmentArchive', adversarial: 'armsRace',
    knowledge: 'sources', compute: 'computeAllocations', multi_scale: 'scaleState' };
  for (const [variant, field] of Object.entries(fields)) {
    const sample = fixture(variant);
    sample.state.variantState[field] = { observed: variant };
    const manifest = await snapshots.capture(sample.context);
    const hashes = manifest.components.find((item) => item.id === 'variant-policy').payload.specializedHashes;
    assert.equal(hashes[field], digest(sample.state.variantState[field]), variant);
  }
});
