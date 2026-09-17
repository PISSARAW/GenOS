import assert from 'node:assert/strict';
import { validateCliArguments } from './argumentValidation.js';

assert.match(validateCliArguments('genos_snapshot', {}), /agent/);
assert.match(validateCliArguments('genos_replay', {}), /snapshot/);
assert.match(validateCliArguments('genos_snapshot', { agent: '../agent', out: 'result.json' }), /parent/);
assert.equal(validateCliArguments('genos_snapshot', { agent: 'agent', out: 'result.json' }), null);
console.log('MCP CLI argument validation checks passed.');
