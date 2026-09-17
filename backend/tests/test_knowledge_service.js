'use strict';

const assert = require('node:assert/strict');
const knowledge = require('../src/services/knowledgeService');
const router = require('../src/services/philosophyRouter');

const claim = {
  id: 'claim-knowledge-1',
  type: 'belief',
  statement: 'Le test de santé répond correctement.',
  evidence: [{ kind: 'test_result', result: 'exit 0' }],
};

const analysis = knowledge.analyzeKnowledge({ claim, truthValue: true, truthSource: 'test-suite' });
assert.equal(analysis.status, 'knowledge-candidate');
assert.equal(analysis.tripartite.satisfied, true);
assert.equal(analysis.truth.verified, false);
assert.equal(analysis.justification.valid, true);

const unknown = knowledge.analyzeKnowledge({ claim });
assert.equal(unknown.status, 'truth-undetermined');
assert.equal(unknown.tripartite.truth, false);

const gettier = knowledge.analyzeGettier({
  claim,
  truthValue: true,
  epistemicLuck: true,
  causalConnection: false,
  reliableProcess: false,
  intellectualVirtue: false,
});
assert.equal(gettier.status, 'gettier-counterexample');
assert.equal(gettier.gettier.counterexample, true);
assert.equal(gettier.defenses.reliabilism.status, 'unsupported');
assert.equal(gettier.defenses.antiLuck.status, 'unsupported');

const defended = knowledge.assessPostGettierDefenses({
  claim,
  truthValue: true,
  epistemicLuck: false,
  reliableProcess: true,
  causalConnection: true,
  intellectualVirtue: true,
});
assert.equal(defended.gettierStatus, 'protected-knowledge-candidate');
assert.equal(defended.defenses.reliabilism.status, 'supported');

const routed = router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'epistemology.knowledge', claim, truthValue: true } },
});
assert.equal(routed.then !== undefined, true);
routed.then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.status, 'knowledge-candidate');
  console.log('Knowledge belief/truth/justification analysis: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
