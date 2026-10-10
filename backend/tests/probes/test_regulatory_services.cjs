'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '../../..');
const state = require(path.join(root, 'backend/src/services/regulation/regulatoryStateService.js'));
const bridge = require(path.join(root, 'backend/src/services/regulation/regulatoryBridgeService.js'));
let sequence = 0;
const fresh = () => `regulation-probe-${process.pid}-${++sequence}`;
const in01 = (v) => Number.isFinite(v) && v >= 0 && v <= 1;

test('Les variables exposées restent finies et bornées après entrées extrêmes', () => {
  const id = fresh();
  state.updateState(id, {
    energy: -10, integrity: 20, curiosity: Infinity, survival: NaN,
    stress: 5, threat: -3,
    hormones: { dopamine: 3, cortisol: -2, serotonin: Infinity, adrenaline: NaN }
  });
  const snapshot = bridge.toSnapshot(id);
  const values = [...Object.values(snapshot.drives), ...Object.values(snapshot.modulators),
    ...Object.values(snapshot.cognitive)];
  assert.ok(values.every(in01), JSON.stringify(snapshot));
});

test('Le mode devient conservateur ou récupération sous perturbation', () => {
  const id = fresh();
  state.updateState(id, { energy: 0.2, integrity: 0.3, survival: 0.8, stress: 0.9 });
  assert.equal(state.getState(id).cognitive.mode, 'CONSERVATIVE');
  assert.equal(state.computeDominantDrive(state.getState(id)), 'CONSERVE');
  state.updateState(id, { energy: 0.8, survival: 0.1 });
  assert.equal(state.getState(id).cognitive.mode, 'RECOVERY');
});

test('Un retour positif répété ramène le stress dans la plage de fonctionnement', () => {
  const id = fresh();
  state.updateState(id, { stress: 0.95, hormones: { cortisol: 0.95 } });
  for (let i = 0; i < 6; i++) bridge.applyRpe(id, 1);
  const actual = state.getState(id);
  assert.ok(actual.stress <= 0.7, `stress=${actual.stress}`);
  assert.equal(actual.cognitive.mode, 'NORMAL');
});

test('Un retour neutre ne doit pas accroître la pression interne', () => {
  const id = fresh();
  const before = state.getState(id);
  const after = bridge.applyRpe(id, 0);
  assert.ok(after.stress <= before.stress && after.hormones.cortisol <= before.hormones.cortisol,
    `stress: ${before.stress} -> ${after.stress}; cortisol: ${before.hormones.cortisol} -> ${after.hormones.cortisol}`);
});

test('La boucle de feedback restaure énergie et intégrité dégradées', () => {
  const id = fresh();
  state.updateState(id, { energy: 0.2, integrity: 0.3 });
  for (let i = 0; i < 20; i++) bridge.applyRpe(id, 1);
  const actual = state.getState(id);
  assert.ok(actual.energy >= 0.4 && actual.integrity >= 0.5,
    `energy=${actual.energy}; integrity=${actual.integrity}`);
});

test('La validation rejette une variable interne hors de [0,1]', () => {
  const id = fresh();
  const snapshot = bridge.toSnapshot(id);
  snapshot.drives.energy = -1;
  assert.equal(bridge.validateSnapshot(snapshot).valid, false);
});
