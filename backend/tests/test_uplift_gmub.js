'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { summarizePaired } = require('../src/services/uplift/pairedStats');
const { buildLadder, upliftCard } = require('../src/services/uplift/ladderService');
const { summarizeCost } = require('../src/services/uplift/costAccounting');

describe('gmub stats', () => {
  it('declares beaten only on robust CI', () => {
    const pairs = [
      { solo: 0.4, genos: 0.7 },
      { solo: 0.45, genos: 0.72 },
      { solo: 0.5, genos: 0.75 },
      { solo: 0.42, genos: 0.7 }
    ];
    const out = summarizePaired(pairs, { reps: 500, seed: 7 });
    assert.equal(out.beaten, true);
    assert.ok(out.lcb > 0);
  });

  it('stays inconclusive on noise', () => {
    const pairs = [
      { solo: 0.5, genos: 0.51 },
      { solo: 0.52, genos: 0.5 },
      { solo: 0.5, genos: 0.52 }
    ];
    const out = summarizePaired(pairs, { reps: 500, seed: 7 });
    assert.equal(out.beaten, false);
  });
});

describe('gmub ladder', () => {
  it('builds emergent ladder and HMB', () => {
    const ladder = buildLadder([
      { model: 'llama-a', mode: 'solo', score: 0.38 },
      { model: 'llama-b', mode: 'solo', score: 0.46 },
      { model: 'astra', mode: 'solo', score: 0.69 }
    ]);
    assert.deepEqual(ladder.map((s) => s.model), ['llama-a', 'llama-b', 'astra']);
    const card = upliftCard({ baseModel: 'llama-b', genosScore: 0.73 }, ladder);
    assert.equal(card.highestBeaten, 'astra');
    assert.equal(card.tierUplift, 1);
  });

  it('summarizes cost without guarantee', () => {
    const cost = summarizeCost({ soloQuality: 0.46, genosQuality: 0.73, soloCost: 1, genosCost: 2.8 });
    assert.ok(cost.costMultiplier > 2);
    assert.equal(cost.qualityGuarantee, false);
  });
});
