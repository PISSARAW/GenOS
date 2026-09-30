'use strict';

const assert = require('node:assert/strict');
const { requestChange } = require('../src/services/development/plasticityRegulatorService');

const id = `axolotl-test-${Date.now()}`;
assert.equal(requestChange({ id, to: 'STABLE', reason: 'direct skip' }).reason, 'transition_not_allowed');
const differentiating = requestChange({ id, to: 'DIFFERENTIATING', reason: 'validated structural need' });
assert.equal(differentiating.ok, true);
assert.equal(differentiating.state.history[0].reason, 'validated structural need');
assert.equal(requestChange({ id, to: 'STABLE', reason: 'skip consolidation' }).reason, 'transition_not_allowed');
