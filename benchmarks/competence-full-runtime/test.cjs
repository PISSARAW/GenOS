'use strict';

const assert = require('node:assert/strict');
const programs = require('./programs.cjs');
const corpus = require('../competence-five-arms/corpus.cjs');
const rule = {op: 'op_1234abcd', epoch: 0, kind: 'hinge', a: -1, b: 2, c: 2,
  confidence: 0.9, reason: 'answerable'};
const observations = [-2, -1, 0, 1, 2, 7].map(x => ({op: rule.op, epoch: 0, x, y: corpus.value(rule, x)}));
assert.equal(programs.identifiable(observations), true);
assert.equal(programs.identifiable(observations.slice(0, 5)), false,
  'Samples below the hinge cannot distinguish the affine continuation.');
assert.equal(programs.admit({rules: [rule], observations}).accepted.length, 1);
assert.equal(programs.admit({rules: [{...rule, c: 1}], observations}).accepted.length, 0);
assert.equal(programs.admit({rules: [{...rule, epoch: 1}], observations}).accepted.length, 0);
const query = {expression: corpus.expression([rule.op, rule.op], 103), epochs: {}};
assert.equal(programs.predict({query, rules: [rule], observations}).answer,
  corpus.value(rule, corpus.value(rule, 103)));
assert.equal(programs.predict({query, rules: [], observations}).abstain, true);
assert.throws(() => programs.parse({fullText: '{}'}), /ARTIFACT_REQUIRED/);
assert.throws(() => programs.parse({fullTextTruncated: true}), /TRUNCATED/);
assert.deepEqual(programs.parse({fullText: JSON.stringify({artifactText:
  '<ARTIFACT: function-programs>' + JSON.stringify({rules: [rule]}) + '</ARTIFACT>'})}), [rule]);
console.log('Public identifiability, unseen compositions, epoch isolation and strict native-artifact parsing: PASS');
