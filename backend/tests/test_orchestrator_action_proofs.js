'use strict';
const assert = require('node:assert/strict');
const { actionArguments } = require('../src/services/orchestrationActionArguments');
const { verifiedResult } = require('../src/services/orchestrationActionResult');
const { validateToolArguments } = require('../src/services/mcpArgumentValidation');
function verify(tool, output) {
  return verifiedResult({ decision: { tool } }, {}, { success: true, output });
}
const root = process.cwd();
const args = actionArguments({ tool: 'genos_execute_primitive' }, {
  payload: { scores: [{ id: 'branch-a', score: 0.8 }, { id: 'branch-b', score: 0.3 }] }
}, root);
assert.equal(args.primitive_name, 'rank_states');
assert.equal(validateToolArguments('genos_execute_primitive', args), null);
assert.equal(actionArguments({ tool: 'genos_execute_primitive' }, { payload: { scores: [{ score: 1 }] } }, root), null);
assert.equal(actionArguments({ tool: 'genos_execute_primitive' }, { payload: { scores: [{ id: 'a', score: NaN }] } }, root), null);
assert.equal(verify('genos_replay', { success: true }).success, false);
assert.equal(verify('genos_replay', { success: true, replay_status: 'VERIFIED', execution_replayed: true }).success, true);
assert.equal(verify('genos_replay', { success: false }).success, false);
assert.equal(verify('genos_snapshot', { success: true }).success, false);
assert.equal(verify('genos_record_experience', { episodeId: 'receipt' }).success, true);
assert.equal(verify('genos_record_experience', {}).success, false);
assert.equal(verify('genos_execute_primitive', { success: false }).success, false);
assert.equal(verify('genos_execute_primitive', { success: true }).success, true);
const pressure = actionArguments({ tool: 'genos_parasitic_pressure' }, { payload: { manifest: 'pressure.json' } }, root);
assert.equal(validateToolArguments('genos_parasitic_pressure', pressure), null);
assert.equal(actionArguments({ tool: 'genos_parasitic_pressure' }, { payload: { manifest: '../outside.json' } }, root), null);
assert.equal(actionArguments({ tool: 'genos_parasitic_pressure' }, { payload: { input: 'pressure.json', output: 'out.json' } }, root), null);
assert.equal(verify('genos_parasitic_pressure', {}).success, false);
assert.equal(verify('genos_parasitic_pressure', { success: false }).success, false);
assert.equal(verify('genos_parasitic_pressure', { success: true }).success, true);
const memory = actionArguments({ tool: 'genos_record_experience' }, {
  agentId: 'worker', eventType: 'AGENT_COMPLETED', payload: { strategy: 'bounded', outcome: 'evidence retained' }
}, root);
assert.equal(validateToolArguments('genos_record_experience', memory), null);
console.log('Typed action proofs and canonical argument contracts passed.');
