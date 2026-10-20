'use strict';

const assert = require('node:assert/strict');
const contract = require('../src/services/studioInterfaceEvolution/contract');
const evaluation = require('../src/services/studioInterfaceEvolution/evaluation');
const governance = require('../src/services/studioInterfaceEvolution/governance');

function setup(userObserved = true) {
  const baseline = contract.createBaseline({
    interfaceId: 'studio-console', interfaceVersion: 3, worldId: 'production', createdBy: 'designer',
    intent: { version: 2, payload: { jobs: ['inspect'] } },
    designSystem: { version: 7, payload: { components: ['button'] } }, evidenceRefs: ['research://intent']
  });
  const candidate = contract.createCandidate({
    candidateId: 'nav-b', baseline, worldId: 'world-b', artifactRef: 'artifact://b',
    intentVersion: 2, designSystemVersion: 7, createdBy: 'builder', evidenceRefs: ['snapshot://b']
  });
  const assessments = evaluation.DIMENSIONS.map(dimension => ({
    dimension, verdict: 'PASS', evaluatorId: `evaluator-${dimension}`,
    method: `probe-${dimension}`, evidenceRef: `evidence://${dimension}`
  }));
  const userSessions = userObserved ? [{ kind: 'user-session', sessionId: 's-1', participantRef: 'p-1',
    taskId: 'inspect', outcome: 'completed', evidenceRef: 'research://s-1' }] : [];
  const result = evaluation.evaluateCandidate({ candidate, assessments,
    observations: { screenshots: [{ artifactRef: 'image://b', viewport: 'desktop' }], userSessions } });
  return { baseline, candidate, evaluation: result };
}

const screenshotOnly = setup(false);
assert.equal(governance.decide({ baseline: screenshotOnly.baseline, options: [{
  candidate: screenshotOnly.candidate, evaluation: screenshotOnly.evaluation,
  measuredEffect: { delta: 0.4, evidenceRef: 'experiment://effect', protocolRef: 'protocol://paired' }
}] }).action, 'NO_CHANGE');

const supported = setup(true);
const decision = governance.decide({ baseline: supported.baseline, minimumGain: 0.1, options: [{
  candidate: supported.candidate, evaluation: supported.evaluation,
  measuredEffect: { delta: 0.25, evidenceRef: 'experiment://effect', protocolRef: 'protocol://paired' }
}] });
assert.equal(decision.action, 'PROPOSE_CHANGE');
assert.equal(decision.promotionGranted, false);
assert.equal(decision.deploymentExecuted, false);

const drift = governance.observeDrift({ baselineHash: supported.baseline.baselineHash,
  signals: [{ name: 'task-abandonment', value: 0.3, threshold: 0.2, evidenceRef: 'telemetry://week-42' }] });
assert.equal(drift.action, 'OPEN_DIAGNOSTIC');
assert.equal(drift.mutationAuthorized, false);
assert.equal(governance.observeDrift({ baselineHash: supported.baseline.baselineHash, signals: [] }).action, 'NO_CHANGE');

assert.throws(() => governance.changeDossier({ decision, authority: { scope: 'interface:read' },
  rollback: { baselineHash: decision.baselineHash } }), /DEPLOYMENT_AUTHORITY_REQUIRED/);
const dossier = governance.changeDossier({ decision,
  authority: { actor: 'owner-1', scope: 'interface:deploy', approvalRef: 'approval://42' },
  rollback: { baselineHash: decision.baselineHash, restoreRef: 'snapshot://production-current',
    reversibleScope: 'future-local-admissions-only' } });
assert.equal(dossier.status, 'READY_FOR_AUTHORIZED_DEPLOYMENT');
assert.equal(dossier.deploymentExecuted, false);
console.log('Studio interface evolution: NO_CHANGE, drift initiative and authority separation passed');
