'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const svc = require('../src/services/bioLineageService');

describe('bioLineageService cycle de vie', () => {
  it('naissance puis differenciation', () => {
    const life = svc.newLifecycle('cell_demo_000001');
    assert.equal(life.stage, 'Naissance');
    const next = svc.transition(life, 'Differenciation');
    assert.equal(next.stage, 'Differenciation');
  });

  it('apoptose terminale refusee', () => {
    const life = svc.newLifecycle('cell_demo_000002');
    const active = svc.transition(life, 'Activite');
    const dead = svc.transition(active, 'Apoptose');
    assert.throws(() => svc.transition(dead, 'Activite'), /interdite/);
  });
});
