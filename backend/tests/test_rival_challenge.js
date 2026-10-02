'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const registry = require('../src/services/agow/experiments/rivalChallengeRegistry');
const runner = require('../src/services/agow/gmw/gmwInterventionRunner');
const { fromTrustedRegistry } = require('../src/services/gvxVerifierRegistry');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  const hash = 'a'.repeat(64);
  const requirements = ['metric:source', 'metric:target', 'metric:inputVector', 'metric:outputDelta'];
  const challenge = { challenge: 'gmw', baseline: { id: 'dense_hub' }, treatment: { id: 'agow' },
    modelLock: { id: 'model-v1' }, toolLock: { hash }, budget: { world: 1 }, seeds: ['seed-1'],
    metrics: ['source', 'target', 'inputVector', 'outputDelta'], ablations: ['mediation_removed'],
    topologyProfile: { name: 'dense', controls: [{ id: 'shared_state', strategyId: 'syncytium' }] },
    verifierProfile: { requirements } };
  require('../src/services/gvxVerifierControlPlaneRegistry').registerVerifierImplementation({ id: 'artifact',
    requirements, verify: async () => ({ verified: true }) });
  const result = await runner.run({ db, registry: registry.createRegistry([challenge]), challenge: 'gmw',
    scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent', snapshotHash: hash,
    verifierRegistry: fromTrustedRegistry(['artifact']), artifactReader: async () => Buffer.from('verified'),
    createIsolatedWorld: async ({ arm, locks }) => ({ worldId: arm.worldId, isolationId: arm.isolationId,
      controlManifest: locks }),
    runArm: async ({ arm }) => ({ status: 'completed', metrics: { source: 'workspace', target: 'planning',
      inputVector: [1, 0], outputDelta: arm.role === 'shared_state' ? [0, 0] : [0.8, 0.2] },
      evidence: requirements.map((requirement) => ({ requirement,
        verifierId: 'artifact', artifactRef: requirement })) }) });
  assert.equal(result.status, 'nursery_review_required');
  assert.equal(result.promotionAllowed, false);
  assert.equal(result.assessments[0].status, 'ready_for_independent_review');
  assert.equal(result.signature.sampleCount, 3);
  assert.ok(result.signature.reachability > 0);
  await db.close();
  console.log('Rival Challenge registry, matched controls and GVX nursery checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
