'use strict';

const assert = require('node:assert/strict');
const social = require('../src/services/socialEpistemologyService');
const router = require('../src/services/philosophyRouter');

const testimony = social.assessTestimony({ claim: 'P', source: 'agent-a', credibility: 0.8, corroboration: ['agent-b'] });
assert.equal(testimony.status, 'supported-testimony');

const discussion = social.assessDiscussion({ claims: ['P', 'not-P'], disagreements: ['truth-value'], resolution: null });
assert.equal(discussion.status, 'unresolved-disagreement');

const labor = social.assessCognitiveLabor({ task: 'audit', agents: ['a', 'b'], specializations: ['security', 'testing'] });
assert.equal(labor.status, 'distributed-knowledge');

const situated = social.assessSituatedKnowledge({ claim: 'P', standpoint: 'operator', location: 'production', accessLimits: ['no-database-access'], affectedVoices: [] });
assert.equal(situated.status, 'situated-and-contextualized');
assert.equal(situated.missingPerspectives, 1);

const critique = social.assessEmancipatoryCritique({ claim: 'P', exclusions: ['operator'], affectedVoices: [] });
assert.equal(critique.status, 'exclusion-identified');

router.handlePhilosophyRequest({
  request: { operation: 'evaluateConcept', arguments: { concept: 'social-epistemology.testimony', claim: 'P', source: 'agent-a', credibility: 0.8, corroboration: ['agent-b'] } },
}).then((result) => {
  assert.equal(result.supported, true);
  assert.equal(result.result.status, 'supported-testimony');
  console.log('Social, feminist and situated epistemology: PASS');
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
