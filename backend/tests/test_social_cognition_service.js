'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');
const { analyzeSocialContext } = require('../src/services/socialCognitionService');

const input = {
  context: 'Débat public sur la qualité de la source',
  actors: [{ id: 'a', label: 'Acteur A' }, { id: 'b', label: 'Acteur B' }],
  sources: [
    { id: 's1', provenance: 'rapport fourni', method: 'observation' },
    { id: 's2', provenance: 'transcription fournie', method: 'témoignage' },
  ],
  claims: [
    { id: 'c1', actorId: 'a', topic: 'qualité', statement: 'La mesure est fiable', sourceId: 's1', confidence: 0.7 },
    { id: 'c2', actorId: 'b', topic: 'qualité', statement: 'La mesure est incertaine', sourceId: 's2', confidence: 0.4 },
  ],
  relations: [{ from: 'a', to: 'b', type: 'disagrees-with' }],
  uncertainties: ['Échantillon incomplet'],
};

async function main() {
  const result = analyzeSocialContext(input);
  assert.equal(result.kind, 'social-cognition-map');
  assert.equal(result.positions.length, 2);
  assert.equal(result.disagreements.length, 1);
  assert.deepEqual(result.disagreements[0], { from: 'a', to: 'b', type: 'disagrees-with' });
  assert.equal(result.sources.length, 2);
  assert.deepEqual(result.sourceComparisons, [{
    topic: 'qualité',
    sources: [{ sourceId: 's1', claimIds: ['c1'] }, { sourceId: 's2', claimIds: ['c2'] }],
  }]);
  assert.deepEqual(result.unknowns, ['Échantillon incomplet']);
  assert.equal(result.promotionEligible, false);
  assert.equal(result.authority, 'descriptive-only');

  const routed = await router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept: 'social-cognition.position-map', ...input } },
  });
  assert.equal(routed.supported, true);
  assert.equal(routed.result.kind, 'social-cognition-map');
  assert.equal(router.getConcept('social-cognition.position-map').serviceMaturity.level, 'partial');

  assert.throws(() => analyzeSocialContext({ ...input, claims: [{ actorId: 'unknown', statement: 'x', sourceId: 's1' }] }), { code: 'SOCIAL_ACTOR_UNKNOWN' });
  assert.throws(() => analyzeSocialContext({ ...input, actors: [{ id: 'a' }, { id: ' a ' }] }), { code: 'SOCIAL_ACTOR_UNKNOWN' });
  assert.throws(() => analyzeSocialContext({ ...input, sources: [{ id: 's1', provenance: 'one' }, { id: ' s1 ', provenance: 'two' }] }), { code: 'SOCIAL_PROVENANCE_MISSING' });
  assert.throws(() => analyzeSocialContext({ ...input, sources: [{ id: 's1' }] }), { code: 'SOCIAL_PROVENANCE_MISSING' });
  assert.throws(() => analyzeSocialContext({ ...input, context: '' }), { code: 'SOCIAL_CONTEXT_INSUFFICIENT' });
  assert.throws(() => analyzeSocialContext({ ...input, runtimeAuthority: 'granted' }), { code: 'SOCIAL_AUTHORITY_REFUSED' });
  assert.throws(() => analyzeSocialContext({ ...input, apply: true }), { code: 'SOCIAL_AUTHORITY_REFUSED' });
  assert.throws(() => analyzeSocialContext({ ...input, promote: true }), { code: 'SOCIAL_AUTHORITY_REFUSED' });
  assert.throws(() => analyzeSocialContext({ ...input, promotionEligible: true }), { code: 'SOCIAL_AUTHORITY_REFUSED' });
  assert.equal(analyzeSocialContext({ ...input, relations: [] }).disagreements.length, 0);
  assert.throws(() => analyzeSocialContext({ ...input, relations: [{ from: 'a', to: 'unknown', type: 'disagrees-with' }] }), { code: 'SOCIAL_ACTOR_UNKNOWN' });
  assert.throws(() => analyzeSocialContext({ ...input, relations: [{ from: 'a', type: 'disagrees-with' }] }), { code: 'SOCIAL_CONTEXT_INSUFFICIENT' });
  assert.throws(() => analyzeSocialContext({ ...input, claims: [input.claims[0], { ...input.claims[1], id: 'c1' }] }), { code: 'SOCIAL_CONTEXT_INSUFFICIENT' });
  assert.throws(() => analyzeSocialContext({ ...input, uncertainties: ['valid', { statement: 'silently dropped before' }] }), { code: 'SOCIAL_CONTEXT_INSUFFICIENT' });
  console.log('Social cognition service: structured positions, provenance, refusals passed.');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
