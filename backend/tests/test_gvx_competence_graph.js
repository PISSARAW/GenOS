'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { appendEvent } = require('../src/services/gvxDevelopmentLedger');
const { buildCompetenceGraph } = require('../src/services/gvxCompetenceGraph');

const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
const hash = 'a'.repeat(64);

function evidence(requirement) {
  return { requirement, verifierId: `verifier-${requirement}`, artifactHash: 'b'.repeat(64) };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const verifierEvidence = evidence('correctness');
    await appendEvent(db, { ...scope, type: 'experiment_finished', parentHash: hash, payload: {
      plan: { experimentId: 'exp-1' },
      assessment: { status: 'ready_for_independent_review' },
      outcomes: [{ status: 'completed', evidence: [verifierEvidence], competenceEvidence: [{
        claim: 'routing.v2', measure: 'verifiedRouteRate', direction: 'higher',
        baseline: 0.5, candidate: 0.75, verifierRefs: [verifierEvidence.artifactHash]
      }] }]
    } });
    await appendEvent(db, { ...scope, type: 'experiment_finished', parentHash: hash, payload: {
      plan: { experimentId: 'exp-2' }, assessment: { status: 'inconclusive' }
    } });
    await appendEvent(db, { ...scope, type: 'transformation_proposed', parentHash: hash, payload: {
      candidate: { sourceExperienceIds: ['exp-1', 'exp-2'], skillDelta: {
        adds: ['routing.v2', 'routing.unproven'], requires: ['routing.basics']
      } }
    } });
    const graph = await buildCompetenceGraph(db, scope);
    assert.deepStrictEqual(graph.nodes, [
      { skillId: 'routing.basics', epistemicStatus: 'unknown', evidenceEventIds: [], claims: [] },
      { skillId: 'routing.unproven', epistemicStatus: 'unknown', evidenceEventIds: [], claims: [] },
      { skillId: 'routing.v2', epistemicStatus: 'empirically_supported', evidenceEventIds: [graph.sourceEventIds[0]],
        claims: [{ claim: 'routing.v2', measure: 'verifiedRouteRate', direction: 'higher',
          baseline: 0.5, candidate: 0.75, verifierRefs: [verifierEvidence.artifactHash] }] }
    ]);
    assert.deepStrictEqual(graph.edges, [
      { from: 'routing.basics', to: 'routing.unproven', relation: 'prerequisite' },
      { from: 'routing.basics', to: 'routing.v2', relation: 'prerequisite' }
    ]);
    const isolated = await buildCompetenceGraph(db, { ...scope, projectId: 'other' });
    assert.deepStrictEqual(isolated.nodes, []);
  } finally { await db.close(); }
  console.log('GVX competence graph checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
