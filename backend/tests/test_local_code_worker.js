const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { parseProposal, safePath, executeProposal, proposalResponseFormat } = require('../src/services/localCodeWorkerService');
const { isAllowedSandboxTestCommand } = require('../src/services/sandboxCommandPolicy');
assert.equal(safePath('src/lib.rs'), true);
assert.equal(safePath('tests/security.rs'), false);
assert.equal(safePath('src/lib.test.js'), false);
assert.equal(safePath('Cargo.toml'), false);
assert.throws(() => parseProposal('{"format":"genos.file-replacement/v1","patches":[{"path":"tests/x.rs","content":"x"}],"tests":["cargo test --quiet"],"evidence":"x"}'));
const proposal = parseProposal('{"format":"genos.file-replacement/v1","patches":[{"path":"src/lib.rs","content":"pub fn x() {}"}],"tests":["cargo test --quiet"],"evidence":"unit test"}');
assert.equal(proposal.patches[0].path, 'src/lib.rs');
const responseFormat = proposalResponseFormat();
assert.equal(responseFormat.schema.additionalProperties, false);
assert.deepEqual(responseFormat.schema.required, ['format', 'patches', 'tests', 'evidence']);
assert.deepEqual(require('../src/services/modelProviderRequest').buildRequestBody({
	provider: 'ollama', modelName: 'fixture', prompt: 'Return a proposal.', outputLimit: 128,
	stream: false, nativeOllama: true, responseFormat
}).format, responseFormat.schema);
assert.equal(isAllowedSandboxTestCommand('cargo  test --quiet'), true);
assert.equal(isAllowedSandboxTestCommand('pytest'), true);
assert.equal(isAllowedSandboxTestCommand('cargo test; whoami'), false);
assert.equal(isAllowedSandboxTestCommand('cargo test --manifest-path ../outside/Cargo.toml'), false);
assert.equal(isAllowedSandboxTestCommand('cargo test --config ../outside/config.toml'), false);
assert.equal(isAllowedSandboxTestCommand(`npm test -- ${'a'.repeat(513)}`), false);

(async () => {
	const modelRouter = require('../src/services/modelRouter');
	const workerEvidence = require('../src/services/workerEvidenceBarrierLocal');
	const originalGenerate = modelRouter.generate;
	let observedFormat;
	modelRouter.generate = async (options) => { observedFormat = options.responseFormat; return {}; };
	try {
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'ollama://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker' }, stageTimings: {} });
		assert.deepEqual(observedFormat, responseFormat);
	} finally { modelRouter.generate = originalGenerate; }
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-local-worker-test-'));
	try {
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				text: JSON.stringify({ ...proposal, tests: ['node malicious.js'] }) }),
			/not allow-listed/
		);
		await assert.rejects(fs.access(path.join(root, 'src', 'lib.rs')));
		await fs.mkdir(path.join(root, 'linked-target'));
		await fs.symlink(path.join(root, 'linked-target'), path.join(root, 'linked'), 'junction');
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				text: JSON.stringify({ ...proposal, patches: [{ path: 'linked/escape.rs', content: 'x' }] }) }),
			/symlink/
		);
		await fs.mkdir(path.join(root, 'src'), { recursive: true });
		await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'before');
		const failed = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'],
			text: JSON.stringify({ ...proposal, patches: [{ path: 'src/lib.rs', content: 'after' }], tests: ['pytest'] }) });
		assert.equal(failed.rolledBack, true);
		assert.equal(failed.testStatus, 'failed');
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'before');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
	console.log('Local code worker safety checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
