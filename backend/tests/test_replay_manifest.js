const assert = require('node:assert/strict');
const { buildReplayManifest } = require('../src/services/agentProcessSupervisor');

const manifest = buildReplayManifest({
	agentId: 'agent-1',
	normalizedMission: {
		prompt: 'Reproduce this session',
		role: 'debugger',
		localModel: 'ollama://model',
		executionPolicy: { allowFileEdits: true }
	},
	executionRun: { id: 'run-1' },
	contractRecord: { id: 'contract-1', version: 2 },
	autonomyPlan: { phases: ['test'] },
	runtimeBudget: { tokens: 100 },
	runtimeEnvironment: { NODE_ENV: 'test', API_TOKEN: 'must-not-be-recorded', GENOS_MODEL: 'test-model' },
	workspaceRoot: 'C:/workspace',
	resolvedExecutable: 'local-runtime.cjs'
});

assert.equal(manifest.sessionId, 'run-1');
assert.equal(manifest.prompt, 'Reproduce this session');
assert.equal(manifest.model, 'ollama://model');
assert.deepEqual(manifest.environmentKeys.includes('API_TOKEN'), false);
assert.equal(manifest.environmentKeys.includes('GENOS_MODEL'), true);
assert.equal(manifest.contractVersion, 2);

console.log('Replay manifest wiring: PASS');