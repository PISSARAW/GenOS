import assert from 'node:assert/strict';
import { validateCliArguments } from './argumentValidation.js';

assert.match(validateCliArguments('genos_snapshot', {}), /agent/);
assert.match(validateCliArguments('genos_replay', {}), /snapshot/);
assert.match(validateCliArguments('genos_replay', { snapshot: '../secret' }), /parent/);
assert.match(validateCliArguments('genos_replay', { snapshot: 'C:/secret' }), /relative/);
assert.match(validateCliArguments('genos_replay', { snapshot_id: 'valid', snapshot: '../secret' }), /parent/);
assert.match(validateCliArguments('genos_replay', { snapshot_id: '../secret' }), /parent/);
assert.match(validateCliArguments('genos_replay', { snapshot_id: 'C:/secret' }), /relative/);
assert.match(validateCliArguments('genos_replay', { snapshot: 'valid', snapshot_id: '../secret' }), /parent/);
assert.equal(validateCliArguments('genos_replay', { snapshot_id: 'snapshot.json' }), null);
assert.match(validateCliArguments('genos_snapshot', { agent: '../agent', out: 'result.json' }), /parent/);
assert.equal(validateCliArguments('genos_snapshot', { agent: 'agent', out: 'result.json' }), null);
console.log('MCP CLI argument validation checks passed.');
