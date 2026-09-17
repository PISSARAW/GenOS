'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const reading = await evaluate('interpretation.artistic', {
    readings: [{ claim: 'formal contrast', evidence: ['repeated motif'] }],
    confidence: 0.7
  });
  assert.equal(reading.supported, true);
  assert.equal(reading.result.status, 'interpretive');
  assert.equal(reading.result.revisable, true);
  assert.equal(reading.result.activeReadingCount, 1);

  const evidence = await evaluate('interpretation.intra-extra-artistic', {
    intraArtistic: ['composition'],
    extraArtistic: ['historical context']
  });
  assert.equal(evidence.result.balance, 'mixed');
  assert.equal(evidence.result.intraCount, 1);
  assert.equal(evidence.result.extraCount, 1);

  const indeterminacy = await evaluate('interpretation.indeterminacy', {
    alternatives: ['ironic', 'literal'],
    ambiguities: ['speaker reference']
  });
  assert.equal(indeterminacy.result.degree, 'open');
  assert.equal(indeterminacy.result.preservesPlurality, true);
  assert.equal(indeterminacy.result.conclusion, 'no_unique_interpretation_inferred');

  const author = await evaluate('interpretation.author', {
    author: { name: 'A. Example', intention: 'explore memory', works: ['Work A'] }
  });
  assert.equal(author.result.intention.status, 'attributed_hypothesis');
  assert.equal(author.result.authorFunction, 'contextual_source_not_final_interpretive_authority');

  const death = await evaluate('interpretation.death-of-author', {
    authorialIntent: 'reported intention',
    readings: [{ reader: 'r1', meaning: 'loss' }]
  });
  assert.equal(death.result.authorialIntentRequired, false);
  assert.equal(death.result.meaningStatus, 'reader_constructed_and_revisable');

  const intertext = await evaluate('interpretation.intertextuality', {
    references: ['myth of Orpheus'],
    relations: [{ type: 'allusion', target: 'myth of Orpheus' }]
  });
  assert.deepEqual(intertext.result.relationTypes, ['allusion']);
  assert.equal(intertext.result.theorist, 'Julia Kristeva');

  const embodied = await evaluate('interpretation.embodied-meaning', {
    meaning: 'alienation', embodiment: 'fragmented form', medium: 'painting'
  });
  assert.equal(embodied.result.status, 'interpretive');

  const construction = await evaluate('interpretation.construction', {
    steps: ['observe motif', 'compare context'], construction: 'hypothesis'
  });
  assert.equal(construction.result.status, 'interpretive');

  const reference = await evaluate('interpretation.reference', {
    references: [{ target: 'city', mode: 'denotation' }], representation: 'visual'
  });
  assert.equal(reference.result.status, 'interpretive');

  await assert.rejects(
    () => evaluate('interpretation.artistic', { confidence: 2 }),
    /confidence must be a number between 0 and 1/
  );
  assert.equal(router.registryHealth().valid, true);
  console.log('Interpretation service: author, intertextuality and indeterminacy passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
