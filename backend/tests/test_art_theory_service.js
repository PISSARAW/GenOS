'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const commonSubject = {
    unity: 0.9,
    complexity: 0.7,
    formalRelations: 0.8,
    artworldRecognition: 0.8,
    curatorialContext: 0.6,
    artisticIntention: 0.9,
    emotion: 0.7,
    expression: 0.8,
    audienceTransmission: 0.6,
    resemblance: 0.5,
    transformation: 0.9,
    narrativeOrCatharticEffect: 0.8,
    denotation: 0.7,
    exemplification: 0.6,
    reference: 0.8,
    symbolicSystem: 0.9
  };

  const form = await evaluate('art.significant-form', { subject: commonSubject });
  assert.equal(form.supported, true);
  assert.equal(form.result.status, 'supported');
  assert.equal(form.result.theorist, 'Clive Bell / Roger Fry');

  const institution = await evaluate('art.institutional-theory', { subject: commonSubject });
  assert.equal(institution.result.observedCriteria, 3);
  assert.deepEqual(institution.result.theorists, ['Arthur Danto', 'George Dickie']);

  const expression = await evaluate('art.expressionism', { subject: commonSubject });
  assert.equal(expression.result.status, 'supported');
  assert.match(expression.result.focus, /emotion/);

  const mimesis = await evaluate('art.mimesis', { subject: commonSubject });
  assert.equal(mimesis.result.catharsis, 0.8);

  const representation = await evaluate('art.representation', { subject: commonSubject });
  assert.equal(representation.result.status, 'supported');
  assert.equal(representation.result.theorist, 'Nelson Goodman');

  const definition = await evaluate('art.definition', { subject: commonSubject });
  assert.equal(definition.result.conclusion, 'comparison_only');
  assert.equal(definition.result.theories.length, 5);
  assert.ok(definition.result.compatibleTheories.length > 0);

  const cluster = await evaluate('art.cluster-theory', { theories: ['significantForm', 'institutional', 'unknown'] });
  assert.equal(cluster.result.validTheoryCount, 2);
  assert.deepEqual(cluster.result.criteria.significantForm, ['unity', 'complexity', 'formalRelations']);

  const openConcept = await evaluate('art.open-concept', { subject: { features: ['novelty', 'family-resemblance'] } });
  assert.equal(openConcept.result.status, 'candidate');
  assert.equal(openConcept.result.featureCount, 2);

  const fiction = await evaluate('art.fictional-reference', { subject: { entities: ['Hamlet'], referenceMode: 'make_believe' } });
  assert.equal(fiction.result.referenceMode, 'make_believe');
  assert.equal(fiction.result.status, 'candidate');

  const planned = await evaluate('narrative.fictionality', { subject: { entities: ['x'] } });
  assert.equal(planned.supported, false);
  assert.equal(planned.status, 'planned');

  assert.equal(router.registryHealth().valid, true);
  console.log('Art theory service: definition, institution, expression, mimesis and representation passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
