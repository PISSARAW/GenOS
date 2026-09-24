'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const advisor = require('../src/services/syncytium/runtime/morphogenesisAdvisor');

function main() {
  const input = {
    sharedWriteDensity: 0.8, dependencyDensity: 0.75,
    updateFrequency: 0.5, stalenessCost: 0.4, sharedInvariantCount: 2
  };
  const strong = advisor.evaluateMorphogenesis(input);
  assert.ok(Math.abs(strong.couplingScore - 0.12) < 1e-12);
  assert.equal(strong.targetTopology, 'syncytium');
  assert.equal(strong.transitionRequired, false);

  const loose = advisor.evaluateMorphogenesis({
    sharedWriteDensity: 0.1, dependencyDensity: 0.1, updateFrequency: 0.5, stalenessCost: 0.5
  });
  assert.equal(loose.targetTopology, 'a_team');
  const invariantGuarded = advisor.evaluateMorphogenesis({
    sharedWriteDensity: 0.1, dependencyDensity: 0.1, updateFrequency: 0.5, stalenessCost: 0.5, sharedInvariantCount: 1
  });
  assert.equal(invariantGuarded.targetTopology, 'syncytium');
  assert.equal(advisor.evaluateMorphogenesis({ activeDomains: 1 }).targetTopology, 'direct');
  assert.equal(advisor.evaluateMorphogenesis({ regionalAutonomy: 0.9 }).targetTopology, 'metapopulation');
  assert.equal(advisor.evaluateMorphogenesis({ disagreementCentrality: 0.8 }).targetTopology, 'biocenose');
  assert.equal(advisor.evaluateMorphogenesis({ semanticConflictRate: 0.7, experimentability: 0.8 }).targetTopology, 'trinity');
  assert.throws(() => advisor.evaluateMorphogenesis({ updateFrequency: 1.5 }),
    (error) => error.code === 'SYNCYTIUM_MORPHOGENESIS_SIGNAL_INVALID');
}

async function verifySessionAnalysis() {
  const session = await syncytium.createSession('Coupling state with one active nucleus.', {
    schema: { fields: { status: { dataType: 'LEGACY_LWW' } }, invariants: [{
      id: 'status-present', dependencies: ['status'], predicate: { op: 'present', path: 'status' }
    }] },
    nuclearDomains: [{ domainId: 'worker', members: ['agent'], owns: ['status'] }]
  });
  const result = await syncytium.analyzeSessionMorphogenesis(session.sessionId, {
    sharedWriteDensity: 0.8, dependencyDensity: 0.8, updateFrequency: 0.8, stalenessCost: 0.8
  });
  assert.equal(result.sessionId, session.sessionId);
  assert.equal(result.sharedInvariantCount, 1);
  assert.equal(result.targetTopology, 'direct');
}

Promise.resolve().then(main).then(verifySessionAnalysis).then(() => {
  console.log('Syncytium morphogenesis advisor checks: PASS');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
