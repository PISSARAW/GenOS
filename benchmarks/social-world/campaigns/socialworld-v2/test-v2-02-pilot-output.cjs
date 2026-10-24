'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateFreshOutputArgument } = require('./v2-02-pilot-output.cjs');

test('pilot output accepts only a fresh direct child of D:\\GenOS-runs', () => {
  assert.equal(validateFreshOutputArgument('D:\\GenOS-runs\\qwen-pilot-01', () => false),
    'D:\\GenOS-runs\\qwen-pilot-01');
  assert.throws(() => validateFreshOutputArgument('D:\\GenOS\\campaign', () => false), /direct child/);
  assert.throws(() => validateFreshOutputArgument('C:\\GenOS-runs\\pilot', () => false), /direct child/);
  assert.throws(() => validateFreshOutputArgument('D:\\GenOS-runs\\existing', () => true), /already exists/);
  assert.throws(() => validateFreshOutputArgument('relative\\pilot', () => false), /absolute/);
});
