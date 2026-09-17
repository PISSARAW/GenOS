'use strict';

const assert = require('node:assert/strict');
const aesthetics = require('../src/services/aestheticsService');
const router = require('../src/services/philosophyRouter');

async function evaluate(concept, args) {
  return router.handlePhilosophyRequest({
    request: { operation: 'evaluateConcept', arguments: { concept, ...args } }
  });
}

async function main() {
  const beauty = await evaluate('aesthetics.beauty', {
    subject: { unity: 0.9, coherence: 0.8, purposiveness: 0.7, communicability: 0.6, disinterestedPleasure: 0.85 }
  });
  assert.equal(beauty.supported, true);
  assert.equal(beauty.status, 'implemented');
  assert.equal(beauty.result.status, 'supported');
  assert.equal(beauty.result.confidence, 1);
  assert.equal(beauty.result.universalValidity, 'not_inferred');

  const sublime = await evaluate('aesthetics.sublime', {
    subject: { magnitude: 0.9, force: 0.8, terror: 0.4, representability: 0.2 }
  });
  assert.deepEqual(sublime.result.modes, ['mathematical', 'dynamical']);
  assert.equal(sublime.result.imaginativeLimit, 0.8);
  assert.equal(sublime.result.representability, 0.2);

  const taste = await evaluate('aesthetics.taste', {
    judgments: [
      { pleasure: 0.8, disinterested: true, communicable: true },
      { pleasure: 0.6, disinterested: true, communicable: true },
      { pleasure: 0.9, disinterested: false, communicable: true }
    ]
  });
  assert.equal(taste.result.standardCandidate, true);
  assert.equal(taste.result.qualifiedJudgmentCount, 2);
  assert.equal(taste.result.meanPleasure, 0.7);
  assert.match(taste.result.caveat, /preuve/);

  const experience = await evaluate('aesthetics.aesthetic-experience', {
    experience: { continuity: 0.8, engagement: 0.9, consummation: 0.7, livedContext: 'museum' }
  });
  assert.equal(experience.result.status, 'supported');
  assert.equal(experience.result.experienceIntegrity, 0.8);
  assert.equal(experience.result.livedContext, 'museum');

  const partial = aesthetics.evaluateBeauty({ subject: { unity: 2, coherence: -1 } });
  assert.equal(partial.profile.unity, 1);
  assert.equal(partial.profile.coherence, 0);
  assert.equal(partial.status, 'underdetermined');

  const planned = await evaluate('aesthetics.postmodern-sublime', { subject: { magnitude: 1 } });
  assert.equal(planned.supported, false);
  assert.equal(planned.status, 'planned');

  console.log('Aesthetics service: beauty, sublime, taste and experience passed');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
