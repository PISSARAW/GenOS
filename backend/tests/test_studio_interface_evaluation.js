'use strict';

const assert = require('node:assert/strict');
const contract = require('../src/services/studioInterfaceEvolution/contract');
const evaluation = require('../src/services/studioInterfaceEvolution/evaluation');

function candidate() {
  const baseline = contract.createBaseline({
    interfaceId: 'studio-console', interfaceVersion: 3, worldId: 'production-current', createdBy: 'designer-a',
    intent: { version: 2, payload: { jobs: ['inspect'] } },
    designSystem: { version: 7, payload: { tokens: { spacing: 8 } } },
    evidenceRefs: ['research://interviews/42']
  });
  return contract.createCandidate({
    candidateId: 'compact-navigation', baseline, worldId: 'counterfactual-nav-b',
    artifactRef: 'artifact://nav-b/index.html', intentVersion: 2, designSystemVersion: 7,
    createdBy: 'builder-b', evidenceRefs: ['snapshot://nav-b']
  });
}

function assessment(dimension, verdict, evaluatorId) {
  return { dimension, verdict, evaluatorId, method: `probe-${dimension}`, evidenceRef: `evidence://${evaluatorId}` };
}

const disputed = evaluation.evaluateCandidate({
  candidate: candidate(),
  assessments: [
    assessment('accessibility', 'PASS', 'axe-runner'), assessment('performance', 'PASS', 'browser-metrics'),
    assessment('coherence', 'PASS', 'design-linter'), assessment('anti-generic', 'PASS', 'brand-reviewer'),
    assessment('anti-generic', 'FAIL', 'independent-critic')
  ],
  observations: { screenshots: [{ artifactRef: 'image://desktop', viewport: '1440x1000' }], userSessions: [] }
});
assert.equal(disputed.complete, true);
assert.equal(disputed.disputed, true);
assert.equal(disputed.dimensions.find(item => item.dimension === 'anti-generic').status, 'DISPUTED');
assert.equal(disputed.observations.realUserObserved, false);
assert.equal(disputed.visualSuccess, null);
assert.equal(disputed.deploymentAuthorized, false);

const observed = evaluation.evaluateCandidate({
  candidate: candidate(),
  assessments: evaluation.DIMENSIONS.map(name => assessment(name, 'PASS', `specialist-${name}`)),
  observations: { screenshots: [], userSessions: [{ kind: 'user-session', sessionId: 'session-1',
    participantRef: 'participant-pseudonym-7', taskId: 'inspect-run', outcome: 'completed',
    evidenceRef: 'research://session-1/transcript' }] }
});
assert.equal(observed.observations.realUserObserved, true);
console.log('Studio interface evolution: provenance, disagreement and real user observations passed');
