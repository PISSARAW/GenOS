'use strict';

const assert = require('assert');
const { composeBiocenose, activateBiocenose } = require('../src/services/biocenoseService');
const { composeHolobionte, activateHolobionte } = require('../src/services/holobionteService');

function testBiocenose() {
  const comp = composeBiocenose('Test mission');
  assert.strictEqual(comp.mode, 'biocenose');
  assert.strictEqual(comp.members.length, 4);

  const act = activateBiocenose('Activate community');
  assert.strictEqual(act.activated, true);
  assert.strictEqual(act.status, 'ACTIVE');
}

function testHolobionte() {
  const comp = composeHolobionte('Test host mission');
  assert.strictEqual(comp.mode, 'holobionte');
  assert.strictEqual(comp.members.length, 4);

  const act = activateHolobionte('Activate host');
  assert.strictEqual(act.activated, true);
  assert.strictEqual(act.status, 'ACTIVE');
}

testBiocenose();
testHolobionte();
console.log('✅ Biocenose and Holobionte service tests passed.');
