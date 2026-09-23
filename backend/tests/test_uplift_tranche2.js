'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { summarizeABC } = require('../src/services/uplift/computeControl');
const { weakestCrossover, wmcCurve } = require('../src/services/uplift/wmcService');
const { runReport } = require('../../benchmarks/gmub/run-gmub.cjs');

describe('tranche2 abc', () => {
  it('detects C > B > A ordering', () => {
    const triples = [
      { solo: 0.4, control: 0.5, genos: 0.7 },
      { solo: 0.45, control: 0.54, genos: 0.72 },
      { solo: 0.42, control: 0.5, genos: 0.68 },
      { solo: 0.47, control: 0.55, genos: 0.74 }
    ];
    const out = summarizeABC(triples, { reps: 500, seed: 7 });
    assert.equal(out.controlOverSolo.beaten, true);
    assert.equal(out.genosOverControl.beaten, true);
    assert.equal(out.fullOrdering, true);
    assert.equal(out.organizationBonus, true);
  });

  it('denies ordering when genos adds nothing over naive compute', () => {
    const triples = [
      { solo: 0.4, control: 0.6, genos: 0.6 },
      { solo: 0.45, control: 0.62, genos: 0.61 },
      { solo: 0.42, control: 0.6, genos: 0.62 }
    ];
    const out = summarizeABC(triples, { reps: 500, seed: 7 });
    assert.equal(out.genosOverControl.beaten, false);
    assert.equal(out.fullOrdering, false);
  });
});

describe('tranche2 wmc', () => {
  it('picks the weakest crossover model', () => {
    const cands = [
      { model: 'small', soloScore: 0.3, genosScore: 0.6 },
      { model: 'mid', soloScore: 0.45, genosScore: 0.75 },
      { model: 'big', soloScore: 0.6, genosScore: 0.8 }
    ];
    const found = weakestCrossover(cands, { score: 0.69, margin: 0 });
    assert.equal(found.model, 'mid');
  });

  it('builds a wmc curve across versions', () => {
    const curve = wmcCurve([
      { genosVersion: 'v3', candidates: [{ model: 'big', soloScore: 0.6, genosScore: 0.75 }] },
      { genosVersion: 'v5', candidates: [{ model: 'small', soloScore: 0.3, genosScore: 0.72 }] }
    ], { score: 0.69, margin: 0 });
    assert.deepEqual(curve.map((c) => c.weakest), ['big', 'small']);
  });

  it('runner reports abc and wmc', () => {
    const input = require('../../benchmarks/gmub/example-runs.json');
    const report = runReport(input);
    assert.equal(report.abc.fullOrdering, true);
    assert.equal(report.wmc.model, 'llama-b');
  });
});
