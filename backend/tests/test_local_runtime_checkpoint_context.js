'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const checkpoints = require('../src/services/localRuntimeCheckpoint');

const state = { framedPrompt: 'strict cooperative checkpoint prompt' };

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

test('native generated context is accepted without inventing runtime state', () => {
  const context = checkpoints.build(state, 'generated', 'model reply');
  assert.deepEqual(context, {
    kind: 'genos-local-runtime', version: 1, phase: 'generated',
    promptHash: hash(state.framedPrompt), reply: 'model reply'
  });
  assert.deepEqual(checkpoints.cooperativeResume(context, state), {
    phase: 'generated', reply: 'model reply'
  });
});

test('cooperative generated context is exact and bound to the framed prompt', () => {
  const context = checkpoints.build(state, 'generated', 'model reply');
  assert.equal(checkpoints.cooperativeResume({ ...context, extra: true }, state), null);
  assert.equal(checkpoints.cooperativeResume({ ...context,
    promptHash: hash('other prompt') }, state), null);
  assert.equal(checkpoints.cooperativeResume({ ...context, reply: '' }, state), null);
  assert.equal(checkpoints.cooperativeResume({ ...context, reply: null }, state), null);
});

test('live cooperative resume refuses evaluated and oversized replies', () => {
  const evaluated = checkpoints.build(state, 'evaluated', 'evaluated reply');
  assert.equal(checkpoints.cooperativeResume(evaluated, state), null);
  const oversized = checkpoints.build(state, 'generated',
    'x'.repeat(checkpoints.MAX_CONTROL_REPLY_BYTES + 1));
  assert.equal(checkpoints.cooperativeResume(oversized, state), null);
});
