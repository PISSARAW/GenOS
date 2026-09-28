'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const svc = require('../src/services/bioContractsService');

describe('bioContractsService frontiere Rust/Node', () => {
  it('accepte le schema 1.x et refuse 2.x', () => {
    assert.equal(svc.isCompatible('1.4.0'), true);
    assert.equal(svc.isCompatible('2.0.0'), false);
    assert.throws(() => svc.checkCompatible('2.0.0'), /incompatible/);
  });

  it('refuse le depassement de budget', () => {
    assert.throws(() => svc.validateBudget({ reserved: 10, consumed: 11, ceiling: 100 }), /depassement/);
  });

  it('construit un recu canonique versionne', () => {
    const receipt = svc.buildReceipt({
      organism_id: 'org_demo_000001',
      agent_id: 'cell_demo_000001',
      genome_id: 'genome_demo',
      episode_id: 'evt_demo_000001',
      initial_state_hash: 'hash0',
      effect_id: 'eff1',
      proof: 'preuve-test',
      effect_origin: 'simulated',
    });
    assert.equal(receipt.schema_version, svc.SCHEMA_VERSION);
  });
});
