'use strict';

const assert = require('node:assert');
const { describe, it } = require('node:test');
const { parseArgs, buildSkeleton } = require('../../benchmarks/gmub/new-campaign.cjs');

const ARGS = ['--suite', 'gmub-r1', '--model', 'b', '--models', 'a,b,f', '--cases', 'c1,c2', '--out', 'x.json'];

describe('campaign scaffold', () => {
  it('parses campaign arguments', () => {
    const cfg = parseArgs(ARGS);
    assert.equal(cfg.model, 'b');
    assert.deepEqual(cfg.models, ['a', 'b', 'f']);
    assert.deepEqual(cfg.cases, ['c1', 'c2']);
  });

  it('scaffolds solo rows plus control and genos rows', () => {
    const skel = buildSkeleton(parseArgs(ARGS));
    const solos = skel.runs.filter((r) => r.mode === 'solo');
    const controls = skel.runs.filter((r) => r.mode === 'compute_control');
    const genos = skel.runs.filter((r) => r.mode === 'genos');
    assert.equal(solos.length, 6);
    assert.equal(controls.length, 2);
    assert.equal(genos.length, 2);
    assert.ok(skel.runs.every((r) => r.score === null));
  });
});
