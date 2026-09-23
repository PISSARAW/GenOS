'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { attributionVerdict } = require('../src/services/uplift/capabilityAttribution');
const { contributionOf } = require('../src/services/uplift/ablationService');
const { biomimeticVerdict } = require('../src/services/uplift/biomimicryTest');
const { runReport } = require('../../benchmarks/gmub/run-gmub.cjs');

const RUN = {
  topology: 'biome',
  declared_capabilities: ['STIGMERGY', 'SIGNALING_BUS'],
  activated_capabilities: ['STIGMERGY', 'SIGNALING_BUS'],
  observed_capabilities: ['STIGMERGY', 'SIGNALING_BUS']
};

describe('gcab attribution', () => {
  it('attributes only when observed via lease via contract', () => {
    const out = attributionVerdict(RUN, { required: ['STIGMERGY', 'SIGNALING_BUS'] });
    assert.equal(out.verdict, 'attributable');
    assert.equal(out.attributable, true);
  });

  it('rejects contract-only capabilities', () => {
    const out = attributionVerdict(
      { ...RUN, activated_capabilities: [], observed_capabilities: [] },
      { required: ['STIGMERGY', 'SIGNALING_BUS'] }
    );
    assert.equal(out.verdict, 'contract_only');
    assert.equal(out.attributable, false);
  });

  it('flags unscoped activation outside the topology', () => {
    const out = attributionVerdict(
      { ...RUN, activated_capabilities: ['STIGMERGY', 'EXTRA_WORKER'] },
      { required: ['STIGMERGY', 'SIGNALING_BUS'] }
    );
    assert.equal(out.verdict, 'unscoped_activation');
  });
});

describe('gcab ablations', () => {
  it('measures causal contribution of a capability', () => {
    const out = contributionOf({
      capability: 'memory',
      pairs: [
        { full: 0.7, ablated: 0.4 },
        { full: 0.72, ablated: 0.45 },
        { full: 0.68, ablated: 0.42 },
        { full: 0.74, ablated: 0.47 }
      ]
    }, { reps: 500, seed: 7 });
    assert.equal(out.causal, true);
    assert.ok(out.contribution > 0.2);
  });
});

describe('gcab biomimicry', () => {
  it('requires wins on exploration, recovery and diversity', () => {
    const samples = [];
    for (const dim of ['exploration', 'recovery', 'diversity']) {
      samples.push(
        { dimension: dim, bio: 0.7, nonbio: 0.4 },
        { dimension: dim, bio: 0.72, nonbio: 0.45 },
        { dimension: dim, bio: 0.68, nonbio: 0.42 }
      );
    }
    const out = biomimeticVerdict(samples, { reps: 500, seed: 7 });
    assert.equal(out.bioSuperior, true);
  });

  it('runner exposes the gcab section', () => {
    const report = runReport({
      suite: 'gmub-v1',
      model: 'llama-b',
      stats: { reps: 200, seed: 7 },
      runs: [],
      gcab: {
        run: RUN,
        contract: { required: ['STIGMERGY', 'SIGNALING_BUS'] },
        ablations: [{ capability: 'memory', pairs: [{ full: 0.7, ablated: 0.4 }] }],
        biomimicry: [{ dimension: 'exploration', bio: 0.7, nonbio: 0.4 }]
      }
    });
    assert.equal(report.gcab.attribution.verdict, 'attributable');
    assert.equal(report.gcab.ablations.length, 1);
  });
});
