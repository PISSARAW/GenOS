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

  it('lien cellule-genome converti en manifeste', () => {
    const link = svc.linkCellGenome('cell_1', 'genome_1', 'pheno_hash');
    const manifest = svc.toManifest(link, 'lin_1');
    assert.equal(manifest.lineage_id, 'lin_1');
    assert.throws(() => svc.toManifest(svc.linkCellGenome('c', 'g', ''), 'lin_1'), /phenotype/);
  });
});
