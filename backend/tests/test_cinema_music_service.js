'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const cinematic = await evaluate('cinema.cinematic-signification', {
    film: { imageTrack: 0.8, soundTrack: 0.7, editing: 0.9, syntagmaticStructure: 0.6 }
  });
  assert.equal(cinematic.supported, true);
  assert.equal(cinematic.result.status, 'supported');
  assert.equal(cinematic.result.theorist, 'Christian Metz');

  const movement = await evaluate('cinema.movement-image', {
    film: { movement: 0.9, perception: 0.8, action: 0.7, sensoryMotorLink: 0.6 }
  });
  assert.equal(movement.result.imageType, 'movement-image');
  assert.equal(movement.result.observedFeatures, 4);

  const time = await evaluate('cinema.time-image', {
    film: { directTime: 0.9, crystalStructure: 0.8, memory: 0.7, duration: 0.6 }
  });
  assert.equal(time.result.imageType, 'time-image');

  const crystal = await evaluate('cinema.crystal-image', {
    film: { actualVirtualIndiscernibility: 0.8, mirrorRelation: 0.7, coexistingTemporalities: 0.9 }
  });
  assert.equal(crystal.result.status, 'supported');

  const reproduction = await evaluate('cinema.mechanical-reproduction', {
    film: { reproducible: true, copies: 1000, distribution: 'streaming' }
  });
  assert.equal(reproduction.result.auraPressure, 'transformed');
  assert.equal(reproduction.result.copies, 1000);

  const aura = await evaluate('cinema.aura', { film: { uniqueness: 0.8, distance: 0.7 } });
  assert.equal(aura.result.aura, 'candidate');

  const narration = await evaluate('cinema.film-narration', { film: { events: [{ id: 1 }], temporalOrder: 'nonlinear' } });
  assert.equal(narration.result.temporalOrder, 'nonlinear');
  assert.equal(narration.result.theorist, 'David Bordwell');

  const cognitive = await evaluate('cinema.cognitive-theory', { film: { cues: ['foreshadowing'] } });
  assert.equal(cognitive.result.status, 'supported');

  const cavell = await evaluate('cinema.ordinary-language', { film: { situation: 'ordinary conversation' } });
  assert.equal(cavell.result.status, 'supported');

  const form = await evaluate('music.musically-beautiful', { music: { form: ['theme', 'variation'], autonomousStructure: true } });
  assert.equal(form.result.status, 'supported');
  assert.deepEqual(form.result.form, ['theme', 'variation']);

  const expression = await evaluate('music.expression', { music: { expressiveContour: 0.8, gesture: 0.7, timbre: 0.9 } });
  assert.equal(expression.result.status, 'supported');

  const emotion = await evaluate('music.emotion', { music: { emotion: 'melancholy', arousal: 0.4, valence: 0.2 } });
  assert.equal(emotion.result.emotion, 'melancholy');

  const tension = await evaluate('music.tension-expectation', { music: { tension: 0.8, expectation: 0.7, resolution: 0.9 } });
  assert.equal(tension.result.status, 'supported');

  const autonomy = await evaluate('music.autonomous-art', { music: { autonomy: true, commodityRelation: 'tension' } });
  assert.equal(autonomy.result.autonomy, true);

  const industry = await evaluate('music.culture-industry', { music: { indicators: ['standardization'], standardization: 0.8, commodification: 0.9 } });
  assert.equal(industry.result.status, 'supported');
  assert.equal(industry.result.commodification, 0.9);

  assert.equal(router.registryHealth().valid, true);
  console.log('Cinema and music service: signification, images, form and emotion passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
