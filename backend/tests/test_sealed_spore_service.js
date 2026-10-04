'use strict';

const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { sealState, openState } = require('../src/services/sealedSporeService');

const previousKey = process.env.GENOS_SECRET_KEY;
process.env.GENOS_SECRET_KEY = randomBytes(32).toString('hex');

try {
  const context = { domainId: 'biome', vaultId: 'population-a', artifactId: 'agent-a',
    artifactVersion: 1, schemaVersion: 1 };
  const state = { individualId: 'agent-a', memory: ['private insight'] };
  const sealed = sealState(state, context);
  const transferred = JSON.parse(JSON.stringify(sealed));
  const authorized = (request) => request.operation === 'spore:thaw' && request.artifactId === 'agent-a';

  assert.equal(JSON.stringify(transferred).includes('private insight'), false);
  assert.notEqual(sealState(state, context).nonce, transferred.nonce);
  assert.deepEqual(openState(transferred, context, authorized), state);
  assert.throws(() => openState(transferred, { ...context, artifactId: 'agent-b' }, () => true));
  assert.throws(() => openState(transferred, { ...context, vaultId: 'population-b' }, () => true));
  assert.throws(() => openState(transferred, { ...context, artifactVersion: 2 }, () => true));
  assert.throws(() => openState({ ...transferred, tag: randomBytes(16).toString('base64') }, context, authorized));
  assert.throws(() => openState(transferred, context, () => false), /SPORE_ACCESS_DENIED/);
  assert.throws(() => openState(transferred, context, () => Date.now() < 0), /SPORE_ACCESS_DENIED/);
  assert.throws(() => openState(transferred, context), /SPORE_ACCESS_DENIED/);
  process.env.GENOS_SECRET_KEY = randomBytes(32).toString('hex');
  assert.throws(() => openState(transferred, context, authorized));
  delete process.env.GENOS_SECRET_KEY;
  assert.throws(() => openState(transferred, context, authorized), /GENOS_SECRET_KEY/);
  console.log('Sealed spore service checks: PASS');
} finally {
  if (previousKey === undefined) delete process.env.GENOS_SECRET_KEY;
  else process.env.GENOS_SECRET_KEY = previousKey;
}
