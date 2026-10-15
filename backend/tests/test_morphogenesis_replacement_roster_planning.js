'use strict';

const assert = require('node:assert/strict');
const service = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const decision = require('../src/services/morphogenesis/morphogenesisEpochDecisionService');

async function verifyIndependentReplacementRoster() {
  const originalCompilePolicy = decision.compilePolicy;
  const composeRequests = [];
  decision.compilePolicy = () => ({ policy: {}, challenge: null, resources: null });
  try {
    const result = await service.planContinuation({
      state: {
        db: {}, normalizedMission: { missionId: 'roster-mission', prompt: 'Adapt the roster.',
          morphogenesisPolicy: { targetWorkers: 3 } },
        plan: { selectedTopology: 'a_team', profile: {}, tokenPolicy: { minimumWorkerTokens: 100 },
          morphogenesisPlan: { selectedTopology: 'a_team', morphologyPatch: { graph: { version: 1 } } } },
        results: new Map([
          ['old-scout', { agentId: 'old-scout', status: 'completed', evidenceScore: 20 }],
          ['old-reviewer', { agentId: 'old-reviewer', status: 'completed', evidenceScore: 30 }]
        ]),
        workers: new Map([
          ['old-scout', { agentId: 'old-scout', role: 'scout', workerKind: 'scout_cell' }],
          ['old-reviewer', { agentId: 'old-reviewer', role: 'reviewer', workerKind: 'review_worker' }]
        ])
      },
      survivors: [{ agentId: 'old-scout' }, { agentId: 'old-reviewer' }],
      continuation: { pool: 900, perWorkerTokens: 100 }, orchestratorId: 'orchestrator'
    }, {
      planMorphogenesis: () => ({ selectedTopology: 'rhizome', selectedVariant: 'causal_microgroup',
        controlReceipt: { topology: { rankings: [
          { topology: 'rhizome' }, { topology: 'biocenose' }
        ] } } }),
      composeMode: async ({ mode, options }) => {
        composeRequests.push({ mode, count: options.agentCount });
        const members = mode === 'rhizome' ? [
          { role: 'hypothesis_builder', workerKind: 'hypothesis_worker', capabilities: ['reason'],
            methodContract: { version: 1, methodId: 'causal_inference' } },
          { role: 'red_reviewer', workerKind: 'red_worker', capabilities: ['adversarial_review'],
            methodContract: { version: 1, methodId: 'adversarial_review' } }
        ] : [{ role: 'evidence_verifier', workerKind: 'verification_worker',
          capabilities: ['verify'], methodContract: { version: 1, methodId: 'evidence_verification' } }];
        return { members: members.map((member) => ({ ...member, executionMode: 'worker' })) };
      }
    });

    assert.equal(result.adapted, true);
    assert.equal(result.assignments && Object.keys(result.assignments).length, 2,
      'the existing survivor assignment API remains available');
    assert.equal(result.targetWorkerCount, 3);
    assert.equal(result.cohortBlueprint.assignments.length, 3,
      'the replacement roster can be larger than the survivor set');
    assert.deepEqual(composeRequests.map((request) => request.count), [3, 3],
      'topology components are composed for the target roster size');
    assert.deepEqual(result.cohortBlueprint.assignments.map((worker) => worker.workerKind), [
      'hypothesis_worker', 'verification_worker', 'red_worker'
    ]);
    assert.deepEqual(result.cohortBlueprint.assignments.map((worker) => worker.role), [
      'hypothesis_builder', 'evidence_verifier', 'red_reviewer'
    ]);
    assert.deepEqual(result.cohortBlueprint.assignments.map((worker) => worker.capabilities), [
      ['reason'], ['verify'], ['adversarial_review']
    ]);
    assert.deepEqual(result.cohortBlueprint.assignments.map((worker) => worker.methodContract.methodId), [
      'causal_inference', 'evidence_verification', 'adversarial_review'
    ]);
    assert.ok(result.cohortBlueprint.assignments.every((worker) => worker.sourceAgentId),
      'lineage is attached as metadata without defining roster membership');
  } finally {
    decision.compilePolicy = originalCompilePolicy;
  }
}

async function verifyFailedCohortCanRecomposeWithoutSurvivors() {
  const originalCompilePolicy = decision.compilePolicy;
  decision.compilePolicy = () => ({ policy: {}, challenge: null, resources: null });
  try {
    const result = await service.planContinuation({
      state: {
        db: {}, normalizedMission: { missionId: 'empty-roster-mission', prompt: 'Recover with new workers.',
          morphogenesisPolicy: { targetWorkers: 3 } },
        plan: { selectedTopology: 'a_team', profile: {}, tokenPolicy: { minimumWorkerTokens: 100 },
          morphogenesisPlan: { selectedTopology: 'a_team', morphologyPatch: { graph: { version: 1 } } } },
        results: new Map([
          ['failed-a', { agentId: 'failed-a', status: 'failed', evidenceScore: 10,
            payload: { error: 'timeout', evidenceReport: { sourceRefs: ['trace:a'] } } }],
          ['failed-b', { agentId: 'failed-b', status: 'failed', evidenceScore: 20,
            payload: { error: 'contract_mismatch', evidenceReport: { sourceRefs: ['trace:b'] } } }]
        ]), workers: new Map()
      },
      survivors: [], continuation: { pool: 900, perWorkerTokens: 100 }, orchestratorId: 'orchestrator'
    }, {
      planMorphogenesis: () => ({ selectedTopology: 'rhizome', selectedVariant: 'causal_microgroup',
        controlReceipt: { topology: { rankings: [
          { topology: 'rhizome' }, { topology: 'biocenose' }
        ] } } }),
      composeMode: async ({ mode }) => ({ members: [{ role: `${mode}_worker`,
        workerKind: mode === 'rhizome' ? 'hypothesis_worker' : 'verification_worker',
        capabilities: ['analyze'], methodContract: { version: 1, methodId: `${mode}_analysis` },
        executionMode: 'worker' }] })
    });

    assert.equal(result.adapted, true, 'failed results provide diagnostic evidence for replanning');
    assert.equal(result.targetWorkerCount, 3);
    assert.equal(result.cohortBlueprint.assignments.length, 3);
    assert.equal(Object.keys(result.assignments).length, 3,
      'candidate assignments are available to bind a graph with no survivors');
    assert.deepEqual(result.plan.morphologyPatch.graph.nodes
      .filter((node) => node.kind === 'TOPOLOGY').map((node) => node.workers.length), [2, 1]);
    assert.ok(result.cohortBlueprint.assignments.every((worker) =>
      ['failed-a', 'failed-b'].includes(worker.sourceAgentId)));
    assert.ok(result.cohortBlueprint.assignments.every((worker) => worker.candidateId));
  } finally {
    decision.compilePolicy = originalCompilePolicy;
  }
}

verifyIndependentReplacementRoster().then(verifyFailedCohortCanRecomposeWithoutSurvivors).then(() => {
  console.log('Morphogenesis replacement roster planning: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
