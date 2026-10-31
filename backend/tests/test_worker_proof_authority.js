'use strict';

const assert = require('node:assert/strict');
const contract = require('../src/services/agents/workerArtifactContract');
const kinds = require('../src/services/agents/workerKindService');
const pipeline = require('../src/services/agentProcessEventPipeline');
const synthesis = require('../src/services/localRuntimeSynthesis');
const receipts = require('../src/services/codeTestExecutionReceipt');
const { digest } = require('../src/services/trinityProvenanceValues');

function reply(test) {
  const evidence = ['mission'];
  if (test) evidence.push(`genos://code-test/${digest(test)}`);
  return { outcome: 'success', claims: [{ statement: 'Le bug est corrigé.', evidence }],
    tests: test ? [test] : [], scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] } };
}

function parentVerdict(report, events = []) {
  const state = { missionDomainState: { unverified: true, missionId: 'proof-mission', workerId: 'proof-worker' } };
  const workerContract = kinds.buildWorkerContract('bounded_worker');
  for (const event of events) pipeline.applyDomainStateFromEvent({ state, event, eventType: event.eventType, workerContract });
  pipeline.applyDomainStateFromEvent({ state, eventType: 'EVIDENCE_REPORT',
    event: { agentId: 'proof-worker', payload: report }, workerContract });
  return state.missionDomainState.domainVerdict;
}

const actual = { command: 'npm test', exitCode: 0, stdout: '1 passed', stderr: '' };
const substituted = { ...actual, stdout: '1000 passed' };
assert.equal(contract.inspectWorkerArtifact('bounded_worker', reply(substituted), {
  executedTests: [actual]
}).artifact, null, 'A matching command and exit code cannot authenticate substituted output');
assert.ok(contract.inspectWorkerArtifact('bounded_worker', reply(actual), { executedTests: [actual] }).artifact);

for (const forged of [actual, { ...actual, passed: true }, { ...actual, executionReceipt: {
  eventId: 'invented', itemId: 'invented', command: 'npm test', exitCode: 0, outputDigest: 'a'.repeat(64)
} }]) {
  const report = reply(forged);
  assert.equal(parentVerdict(report), 'failed', 'Model-declared test metadata is not execution evidence');
}

const forgedArtifact = reply(actual);
forgedArtifact.workerArtifact = contract.inspectWorkerArtifact('bounded_worker', forgedArtifact,
  { executedTests: [actual] }).artifact;
assert.equal(parentVerdict(forgedArtifact), 'failed', 'Model-provided artifact provenance is not host authority');
const misleadingCommand = { eventType: 'AGENT_STEP', id: 'echo-event', action: 'command_execution',
  payload: { type: 'item.completed', item: { id: 'echo-item', type: 'command_execution',
    command: 'echo npm test', status: 'completed', exit_code: 0, aggregated_output: 'npm test' } } };
assert.equal(parentVerdict(reply({ ...actual, passed: true }), [misleadingCommand]), 'failed',
  'An actual echo mentioning npm test does not witness execution of npm test');
const commandEvent = structuredClone(misleadingCommand);
commandEvent.payload.item.command = 'npm test';
commandEvent.payload.item.aggregated_output = '1 passed';
const inventedReceipt = { ...actual, executionReceipt: { eventId: 'echo-event', itemId: 'echo-item',
  command: 'npm test', exitCode: 0, outputDigest: require('node:crypto').createHash('sha256').update('1 passed').digest('hex') } };
assert.equal(parentVerdict(reply(inventedReceipt), [commandEvent]), 'failed',
  'A copied receipt is not attestation by the parent');
const inflated = reply({ ...actual, passed: true, stdout: '1000 passed' });
assert.equal(parentVerdict(inflated, [commandEvent]), 'completed');
assert.equal(inflated.tests[0].stdout, '1 passed', 'The parent must retain its own command output');

const verified = { artifactContentHash: 'b'.repeat(64), contractId: 'contract-one' };
const verificationReport = reply();
verificationReport.codeVerification = verified;
assert.equal(contract.inspectWorkerArtifact('bounded_worker', verificationReport, {
  codeVerificationContract: { expectedContentHash: verified.artifactContentHash }
}).artifact, null, 'An expected hash does not prove a verification was executed');
assert.ok(contract.inspectWorkerArtifact('bounded_worker', verificationReport, { codeVerification: verified }).artifact);
assert.equal(contract.inspectWorkerArtifact('bounded_worker', verificationReport, {
  codeVerification: { ...verified, contractId: 'other-contract' }
}).artifact, null, 'Verification must bind the complete contract identity');

const suite = receipts.buildReceipt({ agentId: 'proof-worker', missionId: 'proof-mission', workspaceRoot: __dirname,
  proofs: [{ ...actual, executed: true, digest: digest(actual) }] });
assert.equal(parentVerdict(reply(actual), [{ ...suite, agentId: 'proof-worker' }]), 'completed');
const wrongMission = structuredClone(suite);
wrongMission.payload.missionId = 'other-mission';
assert.equal(parentVerdict(reply(actual), [{ ...wrongMission, agentId: 'proof-worker' }]), 'failed');
const wrongWorker = { ...suite, agentId: 'other-worker' };
assert.equal(parentVerdict(reply(actual), [wrongWorker]), 'failed');
const foreignSuite = structuredClone(wrongWorker);
foreignSuite.payload.agentId = 'other-worker';
assert.equal(parentVerdict(reply(actual), [foreignSuite]), 'failed');

const failed = reply({ ...actual, exitCode: 1 });
failed.claims[0].statement = 'Analyse du composant effectuée.';
assert.equal(parentVerdict(failed), 'failed', 'A neutral claim does not excuse a failed test');

const state = { mission: { executionMode: 'worker', workerKind: 'bounded_worker' },
  executionPolicy: { allowedCommands: ['npm test'] } };
const pending = { ...reply(), tests: ['npm test'] };
assert.doesNotThrow(() => synthesis.validateWorkerReply(JSON.stringify(pending), state));
for (const tests of [['node test-other.cjs'], ['echo ok'], ['npm test', actual], ['node -e process.exit(0)']]) {
  assert.throws(() => synthesis.validateWorkerReply(JSON.stringify({ ...pending, tests }), state));
}
assert.throws(() => synthesis.validateWorkerReply(JSON.stringify({ ...pending, claims: [] }), state));
assert.equal(contract.inspectWorkerArtifact('bounded_worker', pending).artifact, null,
  'Prevalidation cannot be used as final evidence');

for (const statement of ["Le bug est corrigé sans modifier l'API", "Le bug est corrigé et ne casse pas l'API",
  'The bug is fixed without API changes']) {
  assert.equal(contract.inspectWorkerArtifact('bounded_worker', {
    ...reply(), claims: [{ statement, evidence: ['mission'] }]
  }).artifact, null);
}
for (const statement of ["Le bug n'est pas corrigé", 'The bug is not fixed', 'La correction a échoué']) {
  assert.equal(contract.statesCodeSuccess(statement), false);
}

console.log('Worker proof authority: exact witnesses, identity, prevalidation and negation regressions passed.');
