'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { chooseCapsuleRoot } = require('../src/services/agentWorkspaceLifecycle/placement');

const selected = chooseCapsuleRoot(1024, [
  { path: 'C:\\', availableBytes: 2 * 1024 ** 3, freeRatio: 0.2 },
  { path: 'D:\\', availableBytes: 80 * 1024 ** 3, freeRatio: 0.1 }
]);
assert.equal(selected, path.join('D:\\', 'GenOS', '.genos-agent-worlds'));
assert.throws(() => chooseCapsuleRoot(10 * 1024 ** 3, [
  { path: 'C:\\', availableBytes: 2 * 1024 ** 3, freeRatio: 0.2 }
]), { code: 'WORKSPACE_DISK_SPACE_INSUFFICIENT' });
console.log('Agent workspace placement checks passed.');
