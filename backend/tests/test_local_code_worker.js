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
let unsafeProposalError;
try {
  parseProposal(
    '{"format":"genos.file-replacement/v1","patches":[{"path":"tests/x.rs","content":"x"}],"tests":["cargo test --quiet"],"evidence":"x"}',
    { inputTokens: 70, outputTokens: 30 });
} catch (error) { unsafeProposalError = error; }
assert.ok(unsafeProposalError);
assert.equal(unsafeProposalError.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
assert.match(unsafeProposalError.workerArtifactDiagnostics.error, /Unsafe patch proposal/);
assert.match(unsafeProposalError.workerArtifactDiagnostics.outputExcerpt, /tests\/x\.rs/);
assert.equal(unsafeProposalError.usage.tokens, 100);
const proposal = parseProposal('{"format":"genos.file-replacement/v1","patches":[{"path":"src/lib.rs","content":"pub fn x() {}"}],"tests":["cargo test --quiet"],"evidence":"unit test"}');
assert.equal(proposal.patches[0].path, 'src/lib.rs');
const responseFormat = proposalResponseFormat();
assert.equal(responseFormat.schema.additionalProperties, false);
assert.deepEqual(responseFormat.schema.required, ['format', 'patches', 'tests', 'evidence']);
const leasedResponseFormat = proposalResponseFormat(['npm test', 'node malicious.js']);
assert.deepEqual(leasedResponseFormat.schema.properties.tests.items.enum, ['npm test']);
const webResponseFormat = proposalResponseFormat({ allowedCommands: ['npm test'],
	requiredPatchPaths: ['index.html', 'styles.css', 'script.js'],
	requiredPatchMarkers: { 'index.html': ['data-reveal'] },
	requiredPatchMinimumBytes: { 'index.html': 4500 } });
assert.equal(webResponseFormat.schema.properties.patches.allOf.length, 3);
assert.equal(webResponseFormat.schema.properties.patches.allOf[0].contains.properties.path.const, 'index.html');
assert.deepEqual(webResponseFormat.schema.properties.patches.items.properties.path.enum,
	['index.html', 'styles.css', 'script.js']);
assert.equal(webResponseFormat.schema.properties.patches.minItems, 3);
assert.equal(webResponseFormat.schema.properties.patches.maxItems, 3);
assert.deepEqual(webResponseFormat.schema.properties.patches.allOf[0].contains.properties.content.allOf,
	[{ pattern: 'data-reveal' }]);
assert.equal(webResponseFormat.schema.properties.patches.allOf[0].contains.properties.content.minLength, 4500);
const pathOnlyResponseFormat = proposalResponseFormat({ allowedCommands: ['npm test'],
	requiredPatchPaths: ['index.html'], requiredPatchMinimumBytes: { 'index.html': 1200 } });
const pathOnlyContentSchema = pathOnlyResponseFormat.schema.properties.patches.allOf[0]
	.contains.properties.content;
assert.equal(pathOnlyContentSchema.minLength, 1200);
assert.equal(Object.hasOwn(pathOnlyContentSchema, 'allOf'), false,
	'omit allOf when no required patch markers exist');
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
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'ollama://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker', executionPolicy: { allowedCommands: ['npm test'] } },
			stageTimings: {} });
		assert.deepEqual(observedFormat.schema.properties.tests.items.enum, ['npm test']);
	} finally { modelRouter.generate = originalGenerate; }
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-local-worker-test-'));
	try {
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				text: JSON.stringify({ ...proposal, tests: ['node malicious.js'] }) }),
			/not allow-listed/
		);
		await assert.rejects(fs.access(path.join(root, 'src', 'lib.rs')));
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				requiredPatchPaths: ['src/lib.rs'], requiredPatchMarkers: { 'src/lib.rs': ['required-marker'] },
				text: JSON.stringify(proposal) }),
			/missing required markers/
		);
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				requiredPatchPaths: ['src/lib.rs'], requiredPatchMinimumBytes: { 'src/lib.rs': 100 },
				text: JSON.stringify(proposal) }),
			/smaller than the required/
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
		assert.deepEqual(failed.failedPatchContents, [{ path: 'src/lib.rs', content: 'after' }]);
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'before');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
	console.log('Local code worker safety checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
