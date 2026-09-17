'use strict';

const assert = require('node:assert/strict');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const play = await evaluate('play.play', {
    game: { agon: true, mimicry: true, rules: ['turns', 'score'], voluntary: true }
  });
  assert.equal(play.supported, true);
  assert.deepEqual(play.result.types, ['agon', 'mimicry']);
  assert.equal(play.result.structured, true);

  const circle = await evaluate('play.magic-circle', {
    game: { boundaries: ['rules'], participants: ['p1'], timeLimit: 30 }
  });
  assert.equal(circle.result.circle, 'constituted');
  assert.equal(circle.result.participantCount, 1);

  const agon = await evaluate('play.agon', { subject: { rules: ['score'] } });
  assert.equal(agon.result.selectedType, 'agon');
  assert.deepEqual(agon.result.types, ['agon']);

  const serious = await evaluate('play.serious-games', {
    game: { objectives: ['learn'], learningOutcomes: ['practice'] }
  });
  assert.equal(serious.result.seriousPurpose, true);
  assert.equal(serious.result.status, 'supported');

  const studies = await evaluate('play.game-studies', {
    dimensions: ['mechanics', 'player-experience'], mechanics: { turnBased: true }
  });
  assert.equal(studies.result.status, 'supported');

  const fiction = await evaluate('narrative.fictionality', {
    work: { fictionalMarkers: ['narrator'], worlds: ['world-1'] }
  });
  assert.equal(fiction.result.fictionality, 'candidate');
  assert.equal(fiction.result.makeBelieve, true);

  const makeBelieve = await evaluate('narrative.make-believe', {
    props: ['picture'], imagined: ['character is brave']
  });
  assert.equal(makeBelieve.result.ruleCount, 1);
  assert.equal(makeBelieve.result.status, 'supported');

  const props = await evaluate('narrative.props', { props: ['map'], rules: ['map depicts city'] });
  assert.equal(props.result.function, 'generate_fictional_truths');

  const truth = await evaluate('narrative.truth-in-fiction', {
    propositions: ['hero_is_alive', 'castle_exists'],
    world: { hero_is_alive: true }
  });
  assert.equal(truth.result.assessments[0].trueInWorld, true);
  assert.equal(truth.result.assessments[1].status, 'underdetermined');
  assert.match(truth.result.caveat, /monde réel/);

  const discourse = await evaluate('narrative.fictional-discourse', { text: 'Il était une fois.' });
  assert.equal(discourse.result.assertedOutsideFiction, false);

  const narration = await evaluate('narrative.narration', {
    events: [{ id: 1, event: 'departure' }], narrator: 'first-person', focalization: 'internal'
  });
  assert.equal(narration.result.status, 'supported');
  assert.equal(narration.result.focalization, 'internal');

  const novel = await evaluate('narrative.novel', {
    events: [{ id: 1 }], characters: ['A'], setting: 'Paris'
  });
  assert.equal(novel.result.concept, 'narrative.novel');
  assert.deepEqual(novel.result.characters, ['A']);

  const literature = await evaluate('narrative.literature', { text: 'A text', genre: 'novel' });
  assert.equal(literature.result.status, 'supported');

  assert.equal(router.registryHealth().valid, true);
  console.log('Play and narrative service: game, fiction and narration passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
