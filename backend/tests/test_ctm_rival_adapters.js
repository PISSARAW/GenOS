'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const adapter = require('../../benchmarks/rivals/ctm/ctmDatasetAdapter.cjs');
const campaign = require('../src/services/agow/experiments/ctmExternalCampaignService');
const registry = require('../src/services/agow/experiments/rivalChallengeRegistry');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { fromTrustedRegistry } = require('../src/services/gvxVerifierRegistry');

async function main() {
  const rawCases = createCases();
  const fingerprint = createHash('sha256').update(JSON.stringify(rawCases)).digest('hex');
  const bundle = await adapter.loadCases({ datasetId: 'mustrad', version: 'v1', sourceRef: 'external://holdout',
    sourceFingerprint: fingerprint, loadRawCases: async () => rawCases,
    normalizeCase: async (item) => ({ caseId: item.id, input: item }) });
  assert.equal(bundle.caseCount, 51);
  assert.equal(bundle.cases[50].input.phase, 'drift');
  assert.throws(() => adapter.validateSource({ datasetId: 'unknown' }), /required/);
  await assert.rejects(() => adapter.loadCases({ datasetId: 'mustrad', version: 'v1', sourceRef: 'external',
    sourceFingerprint: 'b'.repeat(64), loadRawCases: async () => rawCases,
    normalizeCase: async (item) => ({ caseId: item.id, input: item }) }), /fingerprint mismatch/);
  await runCampaign(rawCases, fingerprint);
  console.log('CTM external adapters and drift campaign checks passed.');
}

function createCases() {
  return Array.from({ length: 51 }, (_, index) => ({ id: `case-${index + 1}`,
    phase: index === 50 ? 'drift' : 'stable' }));
}

async function runCampaign(rawCases, fingerprint) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  const hash = 'a'.repeat(64);
  const requirements = ['artifact-integrity'];
  const definition = { challenge: 'ctm', baseline: { id: 'ctm_style' }, treatment: { id: 'agow_full' },
    modelLock: { id: 'model-v1' }, toolLock: { hash }, budget: { world: 1 }, seeds: ['seed-1'],
    metrics: ['score'], ablations: [], topologyProfile: { name: 'ctm', controls: [] },
    verifierProfile: { requirements } };
  const artifact = Buffer.from('verified');
  const artifactHash = createHash('sha256').update(artifact).digest('hex');
  let observedManifest;
  const result = await campaign.run({ challenge: 'ctm', datasetId: 'mustrad', version: 'v1',
    sourceRef: 'external://holdout', sourceFingerprint: fingerprint,
    loadRawCases: async () => rawCases, normalizeCase: async (item) => ({ caseId: item.id, input: item }),
    scenario: 'automation_nonstationary', registry: registry.createRegistry([definition]), db,
    scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent', snapshotHash: hash,
    verifierRegistry: fromTrustedRegistry(['artifact-integrity-v1']), artifactReader: async () => artifact,
    createIsolatedWorld: async ({ arm, locks }) => ({ worldId: arm.worldId, isolationId: arm.isolationId,
      controlManifest: locks }),
    runArm: async ({ cases, datasetManifest }) => {
      observedManifest = datasetManifest;
      return { status: 'completed', metrics: { score: cases.length },
        evidence: requirements.map((requirement) => ({ requirement, verifierId: 'artifact-integrity-v1',
          artifactRef: 'artifact', artifactHash })) };
    } });
  assert.equal(result.datasetManifest.sourceFingerprint, fingerprint);
  assert.equal(result.datasetManifest.caseCount, 51);
  assert.equal(observedManifest.datasetId, 'mustrad');
  assert.equal(result.promotionAllowed, false);
  await db.close();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
