'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const values = require('./trinityProvenanceValues');
const safety = require('./pathSafety');
const snapshots = require('./workspaceSnapshotStore');
const receipts = require('./localCodeTestExecutionReceiptService');
const evidence = require('./codeBoundaryEvidence');
const runner = require('./codeBoundaryRunnerHost');
const diagnostics = require('./codeBoundaryFailureDiagnostics');
const { testPassed } = require('./workerCodeEvidenceReferences');
const originals = new WeakMap();

async function bytes(root, relative) {
  try { return await fs.readFile(safety.resolveContainedPathNoSymlinkSync(root, relative, 'boundary test')); }
  catch (cause) { throw Object.assign(values.failure('Q7_BOUNDARY_SOURCE_CHANGED'), { cause }); }
}
async function capture(input) {
  try { return await captureContract(input); }
  catch (error) { throw diagnostics.attach(error); }
}
async function captureContract(input) {
  const contract = require('./codeBoundaryContract').read(input.mission);
  if (!contract) return null;
  if (!input.db?.get || !input.executionRun?.id) evidence.fail('RECEIPT_CONTEXT_REQUIRED');
  await assertScope(input);
  const generated = generatedPatch(input, contract);
  const original = await originalSources(input, contract);
  const visible = await visibleFiles(input, contract, generated);
  validateCases(generated, contract);
  const hostRunner = await runner.install({ workspaceRoot: input.workspaceRoot, contract });
  const planned = input.proposal.patches.map(patch => ({ path: patch.path, hash: values.hashBytes(Buffer.from(patch.content)) }));
  return { contract, original, visible, planned, hostRunner, root: input.workspaceRoot, mission: input.mission,
    runId: input.executionRun.id, startedAt: Date.now() };
}
function validateCases(generated, contract) {
  try { require('./codeBoundaryRunner.cjs').validate(JSON.parse(generated.content), contract.api); }
  catch (error) { throw diagnostics.proposalFailure(error.code === 'Q7_BOUNDARY_DOMAIN_INVALID'
    ? 'Q7_BOUNDARY_DOMAIN_INVALID' : 'Q7_BOUNDARY_FORMAT_INVALID'); }
}
function generatedPatch(input, contract) {
  const paths = [...contract.sourcePaths, contract.generatedTestPath];
  if (input.proposal.patches.some(patch => !paths.includes(patch.path))) evidence.fail('CONTRACT_INVALID');
  const allowed = input.allowedCommands || [];
  if (![contract.command, contract.visibleCommand].every(command => allowed.includes(command))) evidence.fail('TEST_MISSING');
  if (![contract.command, contract.visibleCommand].every(command => input.proposal.tests.includes(command))) {
    throw diagnostics.proposalFailure('Q7_BOUNDARY_TEST_MISSING');
  }
  const generated = input.proposal.patches.find(patch => patch.path === contract.generatedTestPath);
  if (!generated?.content?.trim()) throw diagnostics.proposalFailure('Q7_BOUNDARY_TEST_MISSING');
  return generated;
}
async function visibleFiles(input, contract, generated) {
  const result = [];
  for (const relative of contract.visibleTestPaths) {
    const content = await bytes(input.workspaceRoot, relative);
    result.push({ path: relative, hash: values.hashBytes(content) });
    if (content.toString('utf8').trim() === generated.content.trim()) throw diagnostics.proposalFailure('Q7_BOUNDARY_TEST_COPIED');
  }
  return result;
}
async function assertScope(input) {
  const run = await input.db.get('SELECT agent_id FROM strategy_execution_runs WHERE id=?', input.executionRun.id);
  const member = await input.db.get('SELECT agent_id FROM mission_agents WHERE mission_id=? AND agent_id=?',
    input.mission.missionId, input.mission.agentId);
  if (run?.agent_id !== input.mission.agentId || !member) evidence.fail('RECEIPT_CONTEXT_REQUIRED');
  if (input.mission.executionAuthorityRef) await require('./missionEnvelopeAuthority').assertRun(input.db,
    { agentId: input.mission.agentId, runId: input.executionRun.id, mission: input.mission });
}
async function originalSources(input, contract) {
  if (!originals.has(input.db)) originals.set(input.db, new Map());
  const cache = originals.get(input.db), key = `${input.executionRun.id}:${input.workspaceRoot}`;
  if (cache.has(key)) {
    const prior = cache.get(key);
    if (prior.contractHash !== values.digest(contract)) evidence.fail('SOURCE_CHANGED');
    return prior.original;
  }
  const original = new Map();
  for (const relative of contract.sourcePaths) {
    const content = await bytes(input.workspaceRoot, relative);
    if (values.hashBytes(content) !== contract.sourceHashes[relative]) throw values.failure('Q7_BASELINE_ANCHOR_UNAVAILABLE');
    original.set(relative, content);
  }
  if (cache.size >= 128) cache.delete(cache.keys().next().value);
  cache.set(key, { contractHash: values.digest(contract), original });
  return original;
}
async function assertFiles(state) {
  if (values.digest(require('./codeBoundaryContract').read(state.mission)) !== values.digest(state.contract)) evidence.fail('SOURCE_CHANGED');
  for (const item of [...state.planned, ...state.visible, ...state.hostRunner.files]) {
    if (values.hashBytes(await bytes(state.root, item.path)) !== item.hash) evidence.fail('SOURCE_CHANGED');
  }
}
async function assertRunner(root, files) {
  for (const item of files) {
    if (values.hashBytes(await bytes(root, item.path)) !== item.hash) evidence.fail('SOURCE_CHANGED');
  }
}
async function baseline(state, files) {
  if (files.length > 128 || files.reduce((sum, item) => sum + (item.size || 0), 0) > 4000000) evidence.fail('WORKSPACE_TOO_LARGE');
  const parent = safety.resolveContainedPathNoSymlinkSync(state.root, '.genos/boundary-worlds', 'boundary world');
  await fs.mkdir(parent, { recursive: true });
  safety.resolveContainedPathNoSymlinkSync(state.root, '.genos/boundary-worlds', 'boundary world');
  state.tempRoot = parent;
  const world = await fs.mkdtemp(path.join(parent, 'genos-boundary-'));
  const root = path.join(world, 'root');
  await fs.mkdir(root);
  state.owner = { path: path.join(world, 'owner.json'), value: JSON.stringify({ runId: state.runId,
    agentId: state.mission.agentId, nonce: require('node:crypto').randomUUID() }) };
  await fs.writeFile(state.owner.path, state.owner.value, { flag: 'wx' });
  state.world = world;
  for (const item of files) {
    const destination = safety.resolveContainedPathNoSymlinkSync(root, item.path, 'baseline copy');
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, await bytes(state.root, item.path));
  }
  for (const [relative, content] of state.original) await fs.writeFile(safety.resolveContainedPathNoSymlinkSync(root, relative), content);
  return root;
}
async function assertOwnedWorld(state, root) {
  const relative = path.relative(state.root, root);
  if (safety.resolveContainedPathNoSymlinkSync(state.root, relative, 'boundary world') !== root
    || await fs.readFile(state.owner.path, 'utf8') !== state.owner.value) evidence.fail('WORLD_INVALID');
}
function summary(test) {
  return { command: test.command, exitCode: test.exitCode, signal: test.signal || null,
    timedOut: Boolean(test.timedOut), stdoutHash: values.hashBytes(Buffer.from(test.stdout || '')),
    stderrHash: values.hashBytes(Buffer.from(test.stderr || '')), runnerResult: runner.result(test) };
}
function executed(test, status) {
  const observed = runner.result(test);
  return observed?.schema === 'genos.boundary-run-result/v1' && observed.status === status
    && Number.isSafeInteger(observed.calls) && observed.calls > 0
    && Number.isSafeInteger(observed.assertions) && observed.assertions > 0;
}
function assertionFailure(test) {
  return test.exitCode > 0 && !test.signal && !test.timedOut
    && /AssertionError/.test(test.stderr || '') && /ERR_ASSERTION/.test(test.stderr || '')
    && executed(test, 'failed') && runner.result(test).kind === 'assertion';
}
async function record(input, root, tests) {
  return receipts.recordExecutedBatch(input.db, { missionId: input.mission.missionId,
    agentId: input.mission.agentId, executionRunId: input.executionRun.id, workspaceRoot: root,
    tests, workspaceFiles: await snapshots.collectFiles(root), changedFileHashes: [] });
}
async function verify(state, input) {
  if (!state) return null;
  state.failureContext = diagnostics.context(state, input);
  try { return await verifyContract(state, input); }
  catch (error) { throw diagnostics.attach(error, state.failureContext); }
}
async function verifyContract(state, input) {
  await assertFiles(state);
  const generated = input.tests.find(test => test.command === state.contract.command);
  const visible = input.tests.find(test => test.command === state.contract.visibleCommand);
  if (!generated || !visible || !testPassed(generated) || !testPassed(visible) || !executed(generated, 'passed')
    || !input.testExecutionReceipt) evidence.fail('PATCH_FAILED');
  diagnostics.stage(state, 'baseline_prepare');
  const root = await baseline(state, input.afterFiles);
  state.baselineRunner = await runner.install({ workspaceRoot: root, contract: state.contract });
  await assertOwnedWorld(state, root);
  try { return await compare(state, { ...input, baselineRoot: root, generated, visible }); }
  finally {
    await assertOwnedWorld(state, root);
    if (!path.resolve(state.world).startsWith(`${state.tempRoot}${path.sep}genos-boundary-`)) evidence.fail('WORLD_INVALID');
    await fs.rm(state.world, { recursive: true, force: true });
  }
}
async function compare(state, input) {
  const runTest = require('./localCodeWorkerService').runTest;
  await assertOwnedWorld(state, input.baselineRoot);
  const before = receipts.workspaceDigest(await snapshots.collectFiles(input.baselineRoot));
  diagnostics.stage(state, 'baseline_visible');
  const baselineVisible = await runTest(state.contract.visibleCommand, input.baselineRoot);
  diagnostics.observed(state, 'baseline_visible', baselineVisible);
  if (!testPassed(baselineVisible)) evidence.fail('BASELINE_VISIBLE_FAILED');
  diagnostics.stage(state, 'baseline_generated');
  const baselineTest = await runTest(state.contract.command, input.baselineRoot);
  diagnostics.observed(state, 'baseline_generated', baselineTest);
  await assertRunner(input.baselineRoot, state.baselineRunner.files);
  if (!assertionFailure(baselineTest)) evidence.fail('NON_DISCRIMINATING');
  diagnostics.stage(state, 'baseline_receipt');
  state.failureContext.required.push('baseline');
  const baselineReceipt = await record(input, input.baselineRoot, [baselineVisible, baselineTest]);
  state.failureContext.receiptPresence.baseline = Boolean(baselineReceipt);
  diagnostics.stage(state, 'proof_verification');
  const after = receipts.workspaceDigest(await snapshots.collectFiles(input.baselineRoot));
  if (before !== after) evidence.fail('SOURCE_CHANGED');
  await assertOwnedWorld(state, input.baselineRoot);
  await assertFiles(state);
  const sources = [];
  for (const [relative, content] of state.original) sources.push({ path: relative,
    beforeHash: values.hashBytes(content), candidateHash: values.hashBytes(await bytes(state.root, relative)) });
  if (!sources.some(source => source.beforeHash !== source.candidateHash)) evidence.fail('NON_DISCRIMINATING');
  return evidence.mint({ schema: 'genos.boundary-test-evidence/v1', contractHash: values.digest(state.contract),
    scope: { missionId: input.mission.missionId, agentId: input.mission.agentId, executionRunId: input.executionRun.id },
    sources, generatedTest: evidence.file(state.root, state.contract.generatedTestPath), visibleTests: state.visible,
    candidateVisible: summary(input.visible), candidate: summary(input.generated), baselineVisible: summary(baselineVisible),
    baseline: { ...summary(baselineTest), regression: 'assertion' },
    receiptRefs: { candidate: input.testExecutionReceipt.receiptHash, baseline: baselineReceipt.receiptHash },
    runner: { hash: state.hostRunner.hash, contractHash: state.hostRunner.contractHash },
    taints: ['worker_generated_tests', 'finite_regression_only'], universalCorrectness: false });
}
function withUsage(error, usage) {
  if (!String(error.code || '').startsWith('Q7_BOUNDARY_') && error.code !== 'Q7_BASELINE_ANCHOR_UNAVAILABLE') return error;
  if (Number.isSafeInteger(usage?.inputTokens) && Number.isSafeInteger(usage?.outputTokens)) {
    error.usage = { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
      tokens: usage.inputTokens + usage.outputTokens };
  }
  return error;
}
function repairable(code) {
  return ['Q7_BOUNDARY_TEST_MISSING', 'Q7_BOUNDARY_TEST_COPIED',
    'Q7_BOUNDARY_FORMAT_INVALID', 'Q7_BOUNDARY_DOMAIN_INVALID',
    'Q7_BOUNDARY_PATCH_FAILED', 'Q7_BOUNDARY_NON_DISCRIMINATING'].includes(code);
}
module.exports = { capture, verify, withUsage, repairable };
