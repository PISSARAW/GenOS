'use strict';

const assert = require('node:assert/strict');
const { validate, summarize } = require('../src/services/gvxLongitudinalMonitor');

assert.throws(() => validate({ windows: [{ observationId: '1', contextHash: 'a' }, { observationId: '2', contextHash: 'a' }] }), /diversity/);
const summary = summarize([{ assessment: { status: 'recommend_somatic_trial' } },
  { assessment: { status: 'recommend_somatic_trial' } }, { assessment: { status: 'recommend_somatic_trial' } }],
[{ contextHash: 'a' }, { contextHash: 'b' }, { contextHash: 'c' }], 3);
assert.equal(summary.maturity, 'mature_somatic_eligible');
assert.equal(summary.regressionRate, 0);
console.log('GVX longitudinal monitor checks passed.');
