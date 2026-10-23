'use strict';

const assert = require('assert');
const { assertCleanIntegration } = require('../src/services/ontogenesis/worktreeService');

const snapshot = 'a'.repeat(64);
const allowed = [
  '?? .genos-epoch',
  `?? .genos/workspace-snapshots/${snapshot}/manifest.json`,
  `?? .genos/workspace-snapshots/${snapshot}/files/src/pricing.js`,
  '?? .genos-agent-worlds/trinity-snapshots/' + 'b'.repeat(32) + '/.genos-epoch'
];

assert.doesNotThrow(() => assertCleanIntegration(`${allowed.join('\0')}\0`));
for (const entry of [
  '?? .genos/unknown.json',
  `?? .genos/workspace-snapshots/${snapshot}/../outside.txt`,
  '?? .genos/workspace-snapshots/not-a-digest/files/src.js',
  ' M src/pricing.js'
]) {
  assert.throws(() => assertCleanIntegration(`${entry}\0`), /worktree-integration-sale/);
}

console.log('Ontogenesis generated workspace snapshot checks passed.');
