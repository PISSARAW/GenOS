'use strict';

const assert = require('node:assert/strict');
const { buildSocialMentalModel } = require('../src/services/socialMentalModelService');

function memory(overrides = {}) {
  return {
    id: 'memory-1', subjectAgentId: 'agent-a', otherAgentId: 'agent-b',
    relationType: 'friend', polarity: 'supports', statement: 'They completed a project together.',
    receiptId: 'receipt-1', occurredAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

function main() {
  const model = buildSocialMentalModel({
    subjectAgentId: 'agent-a', otherAgentId: 'agent-b', generatedAt: '2026-10-24T00:00:00.000Z',
    memories: [
      memory(),
      memory({ id: 'memory-2', receiptId: 'receipt-2', occurredAt: '2026-10-02T10:00:00.000Z',
        beliefAboutOther: { proposition: 'B knows the music project is unfinished.', confidence: 0.8 } }),
      memory({ id: 'memory-3', receiptId: 'receipt-3', relationType: 'friend', polarity: 'contradicts',
        statement: 'Their last collaboration ended in disagreement.', occurredAt: '2026-10-03T10:00:00.000Z' }),
      memory({ id: 'foreign-memory', subjectAgentId: 'agent-c' }),
    ],
  });
  assert.equal(model.relationHypotheses[0].relationType, 'friend');
  assert.equal(model.relationHypotheses[0].confidence, 0.6);
  assert.deepEqual(model.relationHypotheses[0].supportingMemoryIds, ['memory-1', 'memory-2']);
  assert.deepEqual(model.relationHypotheses[0].contradictingMemoryIds, ['memory-3']);
  assert.equal(model.beliefsAboutOther[0].sourceMemoryIds[0], 'memory-2');
  assert.equal(model.alternativeInterpretations[0], 'Their last collaboration ended in disagreement.');
  assert.equal(model.sourceMemoryIds.includes('foreign-memory'), false);
  assert.equal(model.authority, 'descriptive-only');
  assert.equal(model.promotionEligible, false);

  const unknown = buildSocialMentalModel({ subjectAgentId: 'agent-a', otherAgentId: 'agent-b', memories: [] });
  assert.equal(unknown.relationHypotheses[0].relationType, 'unknown');
  assert.ok(unknown.unknowns.length > 0);
  assert.throws(() => buildSocialMentalModel({ subjectAgentId: 'agent-a', otherAgentId: 'agent-a', memories: [] }),
    { code: 'SOCIAL_MODEL_INVALID' });
  assert.throws(() => buildSocialMentalModel({ subjectAgentId: 'agent-a', otherAgentId: 'agent-b', memories: [memory({ receiptId: '' })] }),
    { code: 'SOCIAL_MODEL_INVALID' });
  console.log('Social mental model reconstruction: provenance, uncertainty and perspective scope passed.');
}

try { main(); }
catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}
