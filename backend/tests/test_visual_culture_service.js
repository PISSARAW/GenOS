'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const architecture = await evaluate('architecture.philosophy', {
    project: { function: 'housing', form: 'courtyard', materiality: 'brick', habitability: 'shared', site: 'urban' }
  });
  assert.equal(architecture.supported, true);
  assert.equal(architecture.result.observedDimensions, 5);

  const design = await evaluate('design.philosophy', {
    project: { use: 'navigation', affordance: 'visible', accessibility: 'keyboard', materiality: 'digital', socialEffect: 'inclusive' }
  });
  assert.equal(design.result.status, 'supported');
  assert.match(design.result.questions[0], /usage/);

  const digital = await evaluate('digital-art.philosophy', {
    artwork: { computation: true, generativity: true, interactivity: true, networkedProduction: true, medium: 'web' }
  });
  assert.equal(digital.result.observedDimensions, 4);
  assert.equal(digital.result.medium, 'web');

  const video = await evaluate('video.philosophy', {
    work: { duration: '12m', recording: 'digital', montage: 'associative', screenRelation: 'installation' }
  });
  assert.equal(video.result.status, 'supported');

  const surrealism = await evaluate('style.surrealism', {
    features: ['dreamLogic', 'uncanny', 'automaticAssociation']
  });
  assert.equal(surrealism.result.status, 'candidate');
  assert.equal(surrealism.result.confidence, 1);
  assert.equal(surrealism.result.conclusion, 'stylistic_affinity_not_exclusive_classification');

  const cubism = await evaluate('style.cubism', { features: ['multipleViewpoints'] });
  assert.deepEqual(cubism.result.matchedCriteria, ['multipleViewpoints']);
  assert.equal(cubism.result.status, 'candidate');

  const minimalism = await evaluate('style.minimalism', { features: [] });
  assert.equal(minimalism.result.status, 'underdetermined');
  assert.equal(minimalism.result.confidence, 0);

  const allStyles = ['realism', 'naturalism', 'classicism', 'romanticism', 'baroque', 'rococo',
    'geometric', 'abstract', 'minimalism', 'maximalism', 'surrealism', 'cubism', 'futurism',
    'dada', 'pop-art', 'conceptual-art', 'performance-art', 'digital-art', 'bioart', 'land-art',
    'installation', 'cinema'];
  for (const style of allStyles) {
    const result = await evaluate(`style.${style}`, { features: [] });
    assert.equal(result.supported, true, style);
    assert.equal(result.status, 'implemented', style);
    assert.equal(result.result.movement, style === 'geometric' ? 'geometric-abstraction' : style === 'abstract' ? 'abstraction' : style === 'installation' ? 'installation-art' : style);
  }

  assert.equal(router.registryHealth().valid, true);
  console.log('Visual culture service: architecture, design, digital art and movements passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
