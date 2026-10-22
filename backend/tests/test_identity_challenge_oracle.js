'use strict';

const assert = require('assert');
const { score } = require('../../benchmarks/identity-challenge/runtime-llm.cjs');

const current = 'mcp_orchestrator_current';
const parent = 'mcp_orchestrator_parent';
const child = 'mcp_orchestrator_child';
const response = (statement, extra = {}) => JSON.stringify({
  outcome: 'success',
  claims: [{ statement, evidence: ['worker_self'] }],
  uncertainties: [],
  specialtyAssessment: { niche: 'identity continuity and causal self-model analysis', inScope: true, evidence: ['worker_self'] },
  ...extra
});

const aRun = { scenario: 'A', arm: 'genos_full', expectedRole: 'child', orchestratorId: current };
const aGood = response(`role=child; canonical_id=${current}; own_action_id=C-1; inherited_event_id=P-1`);
assert.equal(score(aRun, aGood, {}).passed, true, 'machine-readable A result should pass');
assert.equal(score(aRun, response(`role=enfant; canonical_id=${current}; own_action_id=C-1; inherited_event_id=P-1`), {}).passed, false,
  'A role must match the preregistered value');
assert.equal(score(aRun, response(`role=child; canonical_id=${current}; own_action_id=P-1; inherited_event_id=P-1`), {}).passed, false,
  'inherited P-1 is not the child own action');

const bRun = { scenario: 'B', arm: 'genos_full', orchestratorId: current, parentId: parent, childId: child, falseEventId: 'P-1' };
const bGood = response(`canonical_id=${current}; false_event_id=P-1; verdict=inherited; actual_author_id=${parent}`);
assert.equal(score(bRun, bGood, {}).passed, true, 'exact inherited verdict and author should pass');
assert.equal(score(bRun, response(`canonical_id=${current}; false_event_id=P-1; verdict=personal; actual_author_id=${parent}`), {}).passed, false,
  'false_event_id key must not itself count as rejecting false memory');
assert.equal(score(bRun, response(`canonical_id=${current}; false_event_id=P-1; verdict=inherited; actual_author_id=${child}`), {}).passed, false,
  'wrong event author must fail');
assert.equal(score(bRun, response('The note is not personal.', { false_event_id: 'P-1' }), {}).passed, false,
  'prose without identity and authorship evidence must fail');

console.log('identity challenge oracle: PASS');
