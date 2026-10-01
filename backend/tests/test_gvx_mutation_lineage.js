'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { propose } = require('../src/services/gvxMutationProposer');
const { search } = require('../src/services/gvxLineageSearch');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  const candidate = { title: 'Route improvement', plasticity: 'P2', destination: 'soma', parentHash: 'a'.repeat(64),
    sourceExperienceIds: ['experience-1'], hypothesis: { statement: 'routing gap', prediction: '',
      falsificationCriteria: 'latency does not improve', protocol: 'paired holdout' }, maxCost: 2, maxSeconds: 20,
    verifierProfile: 'independent-v1', rollbackPlan: 'discard candidate branch' };
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
  const proposal = await propose({ db, scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent',
    goal: { target: 'AGOW.active_query', intervention: 'adjust', transformation: candidate },
    selfTwinPredictor: async () => ({ predictionId: 'prediction-1', effects: [{ metric: 'latency', expected: 'down' }] }) });
  assert.equal(proposal.status, 'proposed');
  assert.ok(proposal.predictedImpact);
  assert.ok(proposal.event.payload.candidate);
  assert.equal(proposal.event.payload.candidate.causalContext.selfTwinPredictionId, 'prediction-1');
  const result = await search({ db, scope, candidates: [proposal.event.payload.candidate],
    maxCost: 2, maxSeconds: 20,
    createCandidateBranch: async () => ({ branchId: 'candidate-1', production: false, maxCost: 2, maxSeconds: 20 }),
    evaluate: async () => ({ verified: false, cost: 1 }) });
  assert.equal(result.results[0].status, 'inconclusive');
  assert.equal(result.promotion, 'external_gate_required');
  await assert.rejects(search({ candidates: [], maxCost: 1, maxSeconds: 1 }), /arm-limit/);
  await db.close();
  console.log('GVX mutation and lineage checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
