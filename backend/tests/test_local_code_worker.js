const assert = require('assert');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { parseProposal, safePath, executeProposal, proposalResponseFormat, resolveTestTempRoot } = require('../src/services/localCodeWorkerService');
const { isAllowedSandboxTestCommand } = require('../src/services/sandboxCommandPolicy');
const { summarizeFailedPatches } = require('../src/services/workerCodeTestRepairTelemetry');
const { failureFeedback, repairPlan, run: runCodeRepair } = require('../src/services/workerCodeTestRepair');
const { buildAnalysisPrompt } = require('../src/services/workerEvidenceLocalPrompt');
const { build: schemaRepairFeedback } = require('../src/services/workerCodeTestRepairSchemaFeedback');
const originalConsoleLog = console.log;
const { buildWorkspaceContext } = require('../bin/local-codex-runtime.cjs');
console.log = originalConsoleLog;
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
const codePrompt = buildAnalysisPrompt({ codeWorker: true, agentName: 'developer', prompt: 'Fix the source.',
  workspaceContext: 'src/index.js: small source file' });
assert.match(codePrompt, /Prefer the minimal exact-edit form when possible/);
assert.match(codePrompt, /Each find anchor must occur once/);
const additionalPatchPropertyFeedback = schemaRepairFeedback({ code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
  workerArtifactDiagnostics: { violations: ['/patches/0 must NOT have additional properties'] } },
{ allowedPatchPaths: ['index.html'] });
assert.match(additionalPatchPropertyFeedback, /exactly "path" and "content"/);
assert.match(additionalPatchPropertyFeedback, /exactly "format", "patches", "tests", and "evidence"/);
const invalidReplacementContentFeedback = schemaRepairFeedback({ code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
  workerArtifactDiagnostics: { violations: ['/patches/0/content must be string'] } },
{ allowedPatchPaths: ['index.html'] });
assert.match(invalidReplacementContentFeedback, /`content` must be a JSON string/);
assert.match(invalidReplacementContentFeedback, /complete file text/);
const replacementPrompt = buildAnalysisPrompt({ codeWorker: true, forceFullFileReplacement: true,
  agentName: 'developer', prompt: 'Repair an ambiguous patch.', workspaceContext: 'src/index.js: current contents' });
assert.match(replacementPrompt, /Do not use file-edits or find\/replace anchors/);
const utilityDiagnostics = summarizeFailedPatches({ proposal: { failedPatchContents: [{
  path: 'src/index.js', content: 'function parsePort(value) { return Number.parseInt(value, 10); }\nfunction normalizeEmail(value) { return String(value).trim(); }\nmodule.exports = { parsePort, normalizeEmail };'
}] } });
assert.ok(utilityDiagnostics[0].logic.some((item) => item.includes('function parsePort(value)')));
assert.ok(utilityDiagnostics[0].logic.some((item) => item.includes('function normalizeEmail(value)')));
const focusedFeedback = failureFeedback({ proposal: {
  tests: [{ command: 'npm test', exitCode: 1, stderr: 'parsePort rejects partial numeric strings' }],
  failedPatchContents: [{ path: 'src/index.js', content: 'function parsePort(value) { return Number.parseInt(value, 10); }\nfunction normalizeEmail(value) { return String(value).trim(); }\nmodule.exports = { parsePort, normalizeEmail };' }]
} });
const focusedFunctions = focusedFeedback.split('Functions related to the failing assertions:\n')[1]
  ?.split('\n\nRolled-back candidate')[0] || '';
assert.match(focusedFunctions, /function parsePort\(value\)/);
assert.doesNotMatch(focusedFunctions, /function normalizeEmail\(value\)/);
const numericRepairFeedback = failureFeedback({ proposal: {
	tests: [{ command: 'npm test', exitCode: 1, stderr: 'parsePort rejects partial numeric strings' }],
	failedPatchContents: [{ path: 'src/index.js', content: 'function parsePort(value) { return Number.parseInt(value, 10); }' }]
} });
assert.match(numericRepairFeedback, /Number\.parseInt accepts a valid numeric prefix/);
assert.match(numericRepairFeedback, /validate the entire trimmed input/);
const invalidPortFeedback = failureFeedback({ proposal: {
  tests: [{ command: 'npm test', exitCode: 1,
    stderr: 'parsePort rejects values above 65535: Expected values to be strictly equal:\n\n3000 !== null' }],
  failedPatchContents: [{ path: 'src/index.js',
    content: 'function parsePort(value) { return Number.parseInt(value, 10) || 3000; }' }]
} });
assert.match(invalidPortFeedback, /return null for malformed strings, zero, and values above 65535/);
assert.ok(invalidPortFeedback.includes(String.raw`require /^\d+$/.test(trimmed)`));
assert.match(invalidPortFeedback, /Number\.isInteger\(port\)/);
assert.match(invalidPortFeedback, /Never substitute a default port for invalid input/);
const paginationFeedback = failureFeedback({ proposal: {
  tests: [{ command: 'npm test', exitCode: 1,
    stderr: 'paginate page 1 starts at the first item: expected [a,b], got [c,d]' }],
  failedPatchContents: [{ path: 'src/index.js',
    content: 'function paginate(values, page, pageSize) { return values.slice(page * pageSize); }' }]
} });
assert.match(paginationFeedback, /Compute start = \(page - 1\) \* pageSize/);
assert.match(paginationFeedback, /Do not use page \* pageSize/);
const stableOrderFeedback = failureFeedback({ proposal: {
  tests: [{ command: 'npm test', exitCode: 1,
    stderr: 'uniqueStable preserves first-seen order: expected [b,a,c], got [a,b,c]' }],
  failedPatchContents: [{ path: 'src/index.js',
    content: 'function uniqueStable(values) { return [...new Set(values)].sort(); }' }]
} });
assert.match(stableOrderFeedback, /return \[\.\.\.new Set\(values\)\] with no sort/);
assert.match(stableOrderFeedback, /first occurrence of each value in input order/);
const missingIncreaseButtonFeedback = failureFeedback({ proposal: {
  tests: [{ command: 'npm test', exitCode: 1,
    stderr: "locator.click: Timeout; waiting for getByRole('button', { name: /increase quantity for oats/i })" }],
  failedPatchContents: [{ path: 'index.html',
    content: '<li>Oats 2 <input type="number" aria-label="Increase quantity for Oats"></li>' }]
} });
assert.match(missingIncreaseButtonFeedback, /Render a visible <button type="button"/);
assert.match(missingIncreaseButtonFeedback, /do not use an input or a text-only span/);
assert.deepEqual(repairPlan({ proposal: { tests: [{ stderr:
  "locator.click: Timeout; waiting for getByRole('button', { name: /increase quantity for oats/i })" }] } }),
{ kind: 'ensure_quantity_increment_behavior', label: 'Increase quantity for Oats' });
const exportFilenameFailure = { proposal: { tests: [{ command: 'npm test', exitCode: 1,
  stderr: 'AssertionError: filename does not match /\\\\.(json|csv)$/i at acceptance.cjs:29:10' }] } };
assert.match(failureFeedback(exportFilenameFailure), /filename failed the extension assertion/);
assert.deepEqual(repairPlan(exportFilenameFailure), { kind: 'ensure_json_export', label: 'Export JSON' });
const ambiguousExportControls = { proposal: { tests: [{ command: 'npm test', exitCode: 1,
  stderr: "locator.click: Error: strict mode violation: getByRole('button', { name: /export json|export csv/i }) resolved to 2 elements" }] } };
assert.match(failureFeedback(ambiguousExportControls), /exactly one button/);
assert.match(failureFeedback(ambiguousExportControls), /remove or rename any second Export CSV button/);
const fixedPrecisionFeedback = failureFeedback({ proposal: {
	tests: [{ command: 'npm test', exitCode: 1, stderr: 'formatBytes keeps one decimal: expected 1.0 KB, got 1 KB' }],
	failedPatchContents: [{ path: 'src/index.js', content: "function formatBytes(value) { return Number(value).toFixed(1).replace(/\\.0$/, ''); }" }]
} });
assert.match(fixedPrecisionFeedback, /Keep the requested trailing zeroes from toFixed/);
const editProposal = parseProposal('{"format":"genos.file-edits/v1","patches":[{"path":"src/lib.rs","edits":[{"find":"before","replace":"after"}]}],"tests":["pytest"],"evidence":"minimal exact edit"}');
assert.equal(editProposal.patches[0].edits[0].find, 'before');
assert.throws(() => parseProposal('{"format":"genos.file-edits/v1","patches":[{"path":"src/lib.rs","edits":[{"find":"","replace":"after"}]}],"tests":["pytest"],"evidence":"empty anchor"}'), /Unsafe patch proposal/);
const responseFormat = proposalResponseFormat();
assert.equal(responseFormat.schema.additionalProperties, false);
assert.deepEqual(responseFormat.schema.required, ['format', 'patches', 'tests', 'evidence']);
const fullReplacementFormat = proposalResponseFormat({ forceFullFileReplacement: true });
assert.deepEqual(fullReplacementFormat.schema.properties.format.enum, ['genos.file-replacement/v1']);
assert.deepEqual(Object.keys(fullReplacementFormat.schema.properties.patches.items.properties), ['path', 'content']);
assert.deepEqual(fullReplacementFormat.schema.properties.patches.items.required, ['path', 'content']);
const editWhenReplacementRequired = JSON.stringify({ format: 'genos.file-edits/v1',
  patches: [{ path: 'src/lib.rs', edits: [{ find: 'before', replace: 'after' }] }],
  tests: ['pytest'], evidence: 'anchor' });
assert.throws(() => parseProposal(editWhenReplacementRequired, {},
  { forceFullFileReplacement: true }), /strict schema/);
const leasedResponseFormat = proposalResponseFormat(['npm test', 'node malicious.js']);
assert.deepEqual(leasedResponseFormat.schema.properties.tests.items.enum, ['npm test']);
const webResponseFormat = proposalResponseFormat({ allowedCommands: ['npm test'],
	requiredPatchPaths: ['index.html', 'styles.css', 'script.js'],
	requiredPatchMarkers: { 'index.html': ['data-reveal'] },
	requiredPatchMinimumBytes: { 'index.html': 4500 } });
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
const allowlistedFormat = proposalResponseFormat({ allowedPatchPaths: ['src/lib.rs', 'backend/src/services/repair.js', 'tests/repair.test.js'] });
assert.deepEqual(allowlistedFormat.schema.properties.patches.items.properties.path.enum,
	['src/lib.rs', 'backend/src/services/repair.js'], 'schema excludes unsafe files from the model patch choices');
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
	let observedReasoningEffort;
	modelRouter.generate = async (options) => { observedFormat = options.responseFormat; observedReasoningEffort = options.reasoningEffort; return {}; };
	try {
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'ollama://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker' }, stageTimings: {} });
		assert.deepEqual(observedFormat, responseFormat);
		assert.equal(observedReasoningEffort, 'none');
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'openai://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker' }, stageTimings: {} });
		assert.equal(observedReasoningEffort, undefined);
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'ollama://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker', executionPolicy: { allowedCommands: ['npm test'] } },
			stageTimings: {} });
		assert.deepEqual(observedFormat.schema.properties.tests.items.enum, ['npm test']);
		await workerEvidence.generateWorkerResult({ db: {}, executionRun: { id: 'code-worker-run' },
			workerModel: 'ollama://fixture', latencyMs: 100,
			maxTokens: 100, maxCost: 1, policy: {}, promptText: 'proposal', codeWorker: true,
			mission: { agentId: 'code-worker', forceFullFileReplacement: true }, stageTimings: {} });
		assert.deepEqual(observedFormat.schema.properties.format.enum, ['genos.file-replacement/v1']);
	} finally { modelRouter.generate = originalGenerate; }
	const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-local-worker-test-'));
	try {
		const tempOverride = path.join(root, 'test-temp-root');
		assert.equal(await resolveTestTempRoot({ GENOS_TEST_TEMP_ROOT: tempOverride }), tempOverride,
			'configured test temp root is created and proven writable before running commands');
		const invalidTempRoot = path.join(root, 'temp-root-is-a-file');
		await fs.writeFile(invalidTempRoot, 'not a directory');
		await assert.rejects(resolveTestTempRoot({ GENOS_TEST_TEMP_ROOT: invalidTempRoot }),
			error => error.code === 'WORKER_TEST_ENVIRONMENT_FAILED'
				&& error.testEnvironment.kind === 'temp_root_unavailable');
		await assert.rejects(resolveTestTempRoot({ GENOS_TEST_TEMP_ROOT: 'relative-temp-root' }),
			error => error.code === 'WORKER_TEST_ENVIRONMENT_FAILED'
				&& error.testEnvironment.kind === 'invalid_temp_root');
		await fs.mkdir(path.join(root, 'tests'), { recursive: true });
		await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true,
			scripts: { test: 'node tests/test_temp_directory.js' } }));
		await fs.writeFile(path.join(root, 'tests', 'test_temp_directory.js'), `const assert = require('node:assert/strict');
const expected = ${JSON.stringify(tempOverride)};
if (process.platform === 'win32') {
  assert.equal(process.env.TEMP, expected);
  assert.equal(process.env.TMP, expected);
}
assert.equal(process.env.TMPDIR, expected);`);
		const previousTestTempRoot = process.env.GENOS_TEST_TEMP_ROOT;
		process.env.GENOS_TEST_TEMP_ROOT = tempOverride;
		try {
			const tempProposal = JSON.stringify({ format: 'genos.file-replacement/v1',
				patches: [{ path: 'src/temp-check.js', content: 'module.exports = true;' }],
				tests: ['npm test'], evidence: 'verify isolated test temporary directory' });
			const tempRun = await executeProposal({ workspaceRoot: root, allowedCommands: ['npm test'],
				allowedPatchPaths: ['src/temp-check.js'], text: tempProposal });
			assert.equal(tempRun.testStatus, 'passed', 'test process receives the configured writable temp root');
		} finally {
			if (previousTestTempRoot === undefined) delete process.env.GENOS_TEST_TEMP_ROOT;
			else process.env.GENOS_TEST_TEMP_ROOT = previousTestTempRoot;
		}

		const contextRoot = path.join(root, 'context');
		await fs.mkdir(path.join(contextRoot, 'backend', 'tests'), { recursive: true });
		await fs.mkdir(path.join(contextRoot, 'backend', 'src', 'services'), { recursive: true });
		await fs.writeFile(path.join(contextRoot, 'Cargo.toml'), '[package]');
		await fs.writeFile(path.join(contextRoot, 'backend', 'tests', 'test_regression.js'),
			"const { repair } = require('../src/services/repair');\nassert.throws(() => repair());");
		await fs.writeFile(path.join(contextRoot, 'backend', 'src', 'services', 'repair.js'),
			'module.exports = function repair() {};');
		const workspaceContextDetails = buildWorkspaceContext(contextRoot, {
			allowedCommands: ['node backend/tests/test_regression.js']
		});
		const workspaceContext = workspaceContextDetails.text;
		assert.deepEqual(workspaceContextDetails.patchCandidatePaths,
			['backend/src/services/repair.js'], 'patch candidates follow the function invoked by the failing assertion');
		assert(workspaceContext.includes(`[FICHIER ${path.join('backend', 'tests', 'test_regression.js')}`),
			'context includes the allow-listed failing regression test');
		assert(workspaceContext.includes(`[FICHIER ${path.join('backend', 'src', 'services', 'repair.js')}`),
			'context includes the production module imported by that test');
		assert(workspaceContext.indexOf(`[FICHIER ${path.join('backend', 'tests', 'test_regression.js')}`)
			< workspaceContext.indexOf('[FICHIER Cargo.toml'),
		'test and imported implementation take priority over unrelated root files');
		await assert.rejects(
			executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
				text: JSON.stringify({ ...proposal, tests: ['node malicious.js'] }) }),
			/not allow-listed/
		);
		await assert.rejects(fs.access(path.join(root, 'src', 'lib.rs')));
		await assert.rejects(executeProposal({ workspaceRoot: root, allowedCommands: ['cargo test --quiet'],
			allowedPatchPaths: ['src/lib.rs'],
			text: JSON.stringify({ ...proposal, patches: [{ path: 'src/other.js', content: 'module.exports = 1;' }] }) }),
		/outside the workspace-context allowlist/);
		await assert.rejects(fs.access(path.join(root, 'src', 'other.js')),
			'disallowed patch targets remain untouched');
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
		const editFailure = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'],
			text: JSON.stringify({ ...editProposal, patches: [{ path: 'src/lib.rs', edits: [{ find: 'before', replace: 'after' }] }] }) });
		assert.equal(editFailure.rolledBack, true);
		assert.deepEqual(editFailure.failedPatchContents, [{ path: 'src/lib.rs', content: 'after' }]);
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'before',
			'exact edit is rolled back after its test fails');
		await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'before before');
		await assert.rejects(executeProposal({ workspaceRoot: root, usage: { inputTokens: 80, outputTokens: 20 }, allowedCommands: ['pytest'],
			text: JSON.stringify({ ...editProposal, patches: [{ path: 'src/lib.rs', edits: [{ find: 'before', replace: 'after' }] }] }) }),
		(error) => {
			assert.equal(error.code, 'WORKER_OUTPUT_SCHEMA_VIOLATION');
			assert.match(error.workerArtifactDiagnostics.error, /anchor must occur once/);
			assert.match(error.workerArtifactDiagnostics.outputExcerpt, /genos.file-edits\/v1/);
			assert.equal(error.usage.tokens, 100);
			return true;
		});
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'before before',
			'ambiguous exact edit does not modify the file');
		await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'before');
		const failed = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'],
			text: JSON.stringify({ ...proposal, patches: [{ path: 'src/lib.rs', content: 'after' }], tests: ['pytest'] }) });
		assert.equal(failed.rolledBack, true);
		assert.equal(failed.testStatus, 'failed');
		assert.deepEqual(failed.failedPatchContents, [{ path: 'src/lib.rs', content: 'after' }]);
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'before');
		await fs.writeFile(path.join(root, 'test_candidate.py'), "from pathlib import Path\ndef test_candidate():\n    assert Path('src/lib.rs').read_text() == 'candidate'\n");
		const retainedMission = { localCodeWorker: true, preserveFailedCodeCandidate: true };
		const candidateProposal = (content) => JSON.stringify({ ...proposal, tests: ['pytest'],
			patches: [{ path: 'src/lib.rs', content }] });
		const intermediate = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'], mission: retainedMission,
			text: candidateProposal('intermediate') });
		assert.equal(intermediate.rolledBack, false);
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'intermediate',
			'failed code candidate remains available to the next isolated repair attempt');
		const recovered = await executeProposal({ workspaceRoot: root, allowedCommands: ['pytest'], mission: retainedMission,
			text: candidateProposal('candidate') });
		assert.equal(recovered.testStatus, 'passed', `the next candidate passes the same independent oracle: ${JSON.stringify(recovered.tests)}`);
		assert.equal(await fs.readFile(path.join(root, 'src', 'lib.rs'), 'utf8'), 'candidate');
		let repairAttempts = 0;
		await runCodeRepair({ mission: { localCodeWorker: true, prompt: 'repair', timeoutMs: 10000,
			executionBudget: { tokens: 1000 } }, onRetry: async () => {}, runAttempt: async (mission) => {
			assert.equal(mission.preserveFailedCodeCandidate, true);
			if (++repairAttempts === 1) throw Object.assign(new Error('failed oracle'), {
				code: 'WORKER_TESTS_FAILED', usage: { tokens: 1 },
				proposal: { testStatus: 'failed', failedPatchContents: [{ path: 'src/lib.rs', content: 'intermediate' }] }
			});
			return 'repaired';
		} });
		assert.equal(repairAttempts, 2, 'repair retries preserve the candidate flag throughout the mission');
		const retryPrompts = [];
		let boundedPromptAttempts = 0;
		await runCodeRepair({ mission: { localCodeWorker: true, prompt: 'original task', timeoutMs: 10000,
			executionBudget: { tokens: 10000 } }, onRetry: async () => {}, runAttempt: async (mission) => {
			retryPrompts.push(mission.prompt);
			if (++boundedPromptAttempts === 1 || boundedPromptAttempts === 2) {
				const failure = boundedPromptAttempts === 1 ? 'unique first failure' : 'unique second failure';
				throw Object.assign(new Error(failure), { code: 'WORKER_TESTS_FAILED', usage: { tokens: 1 },
					proposal: { tests: [{ stderr: failure }], failedPatchContents: [{ path: 'src/lib.rs', content: failure }] } });
			}
			return 'repaired';
		} });
		assert.match(retryPrompts[1], /unique first failure/);
		assert.match(retryPrompts[2], /unique second failure/);
		assert.doesNotMatch(retryPrompts[2], /unique first failure/,
			'retry prompts do not accumulate prior failure reports and candidate contents');
	} finally {
		await fs.rm(root, { recursive: true, force: true });
	}
	console.log('Local code worker safety checks passed.');
})().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
