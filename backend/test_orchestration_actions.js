const assert = require('assert');
const { actionArguments } = require('./src/services/orchestrationActionExecutor');
const root = '/tmp/genos-capsule';
assert.deepEqual(actionArguments({ tool: 'genos_replay' }, { payload: {} }, root), { root });
assert.equal(actionArguments({ tool: 'genos_evaluate_trajectories' }, { payload: {} }, root), null);
const experience = actionArguments({ tool: 'genos_record_experience' }, { detail: 'proposal', payload: { proposal: { changedFiles: ['src/a.rs'], tests: [{ command: 'cargo test --quiet', exitCode: 0 }], proposal: { evidence: 'passed' } } } }, root);
assert.equal(experience.successful, true);
assert.equal(actionArguments({ tool: 'genos_parasitic_pressure' }, { payload: { input: '../outside.json', output: 'out.json' } }, root), null);
console.log('Orchestration action checks passed.');
