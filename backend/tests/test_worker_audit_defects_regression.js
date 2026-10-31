'use strict';

const assert = require('node:assert/strict');

const values = require('../src/services/trinityProvenanceValues');
const synthesis = require('../src/services/localRuntimeSynthesis');
const { attachWorkerArtifact } = require('../src/services/workerEvidenceLocalArtifact');
const protocol = require('../src/services/runtimeProtocol');
const pipeline = require('../src/services/agentProcessEventPipeline');
const workerKinds = require('../src/services/agents/workerKindService');
const { queueWorkerRecovery } = require('../src/services/agentRecovery/queueWorkerRecovery');
const durableRecoveryQueue = require('../src/services/agentRecovery/durableRecoveryQueue');

const runtime = require('../bin/local-codex-runtime.cjs');

function baseReply() {
  return {
    outcome: 'success',
    claims: [{ statement: 'Le bug est corrigé et les tests passent.', evidence: ['mission'] }],
    scopeCompletion: { scopeRef: 'mission', completedRefs: ['mission'] }
  };
}

function baseState(proofs = []) {
  return {
    mission: { executionMode: 'worker', workerKind: 'bounded_worker' },
    workspaceRoot: __dirname,
    agentName: 'regression-audit-agent',
    commandProofs: proofs,
    executionPolicy: { allowedCommands: ['npm test', 'node test-failure.cjs'] },
    eventCount: 0
  };
}

function captureEmitCompletion(reply, proofs = []) {
  const chunks = [];
  const origWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(Buffer.from(chunk));
    return true;
  };
  try {
    runtime.emitCompletion(baseState(proofs), JSON.stringify(reply));
  } finally {
    process.stdout.write = origWrite;
  }
  const events = [];
  protocol.decodeEvents(Buffer.concat(chunks), (ev) => {
    events.push({ ...ev, payload: JSON.parse(ev.payloadJson) });
  });
  return events;
}

// Defect 1: Invented proof or read-only file hash must NOT prove a code fix
function testDefect1() {
  const forged = baseReply();
  forged.codeVerification = { artifactContentHash: 'invented' };
  const forgedReport = { fullText: JSON.stringify(forged) };
  assert.throws(
    () => attachWorkerArtifact(forgedReport, { mission: { workerKind: 'bounded_worker' }, agentName: 'test-agent' }),
    { code: 'INVALID_WORKER_ARTIFACT' },
    'Invented artifactContentHash must be rejected'
  );

  const hash = 'a'.repeat(64);
  const hashReply = baseReply();
  hashReply.claims[0].evidence.push('sha256:' + hash);
  const hashReport = { fullText: JSON.stringify(hashReply) };
  assert.throws(
    () => attachWorkerArtifact(hashReport, {
      mission: {
        workerKind: 'bounded_worker',
        readOnlyWorkspaceEvidence: true,
        readFileHashes: { 'buggy.js': hash },
        allowedEvidenceRefs: ['mission', 'sha256:' + hash]
      }
    }),
    { code: 'INVALID_WORKER_ARTIFACT' },
    'A read-only file hash must not substantiate a code fix claim'
  );

  const honestReport = { fullText: JSON.stringify(forged) };
  const verifiedHash = 'b'.repeat(64);
  honestReport.fullText = JSON.stringify({ ...forged, codeVerification: { artifactContentHash: verifiedHash } });
  attachWorkerArtifact(honestReport, {
    mission: {
      workerKind: 'bounded_worker',
      codeVerification: { artifactContentHash: verifiedHash }
    },
    agentName: 'test-agent'
  });
  assert.ok(honestReport.workerArtifact, 'Authentic codeVerification with provenance must be accepted');
}

// Defect 2: Failed real test command must produce outcome: failed and AGENT_FAILED
function testDefect2() {
  const failedProof = { command: 'node test-failure.cjs', exitCode: 1, executed: true, stdout: '', stderr: '1 test failed' };
  const reply = baseReply();
  reply.claims[0].statement = 'Analyse du composant effectuée.';
  reply.tests = ['node test-failure.cjs'];
  const events = captureEmitCompletion(reply, [failedProof]);
  const evidenceReportEvent = events.find((e) => e.eventType === 'EVIDENCE_REPORT');
  const terminalEvent = events.at(-1);

  assert.equal(evidenceReportEvent.payload.outcome, 'failed');
  assert.equal(evidenceReportEvent.payload.tests[0].exitCode, 1);
  assert.equal(terminalEvent.eventType, 'AGENT_FAILED');
  assert.equal(terminalEvent.status, 'failed');

  const domainState = { missionDomainState: { unverified: true } };
  pipeline.applyDomainStateFromEvent({
    state: domainState,
    eventType: 'EVIDENCE_REPORT',
    event: { agentId: 'test-agent', payload: evidenceReportEvent.payload },
    workerContract: workerKinds.buildWorkerContract('bounded_worker')
  });
  assert.equal(domainState.missionDomainState.domainVerdict, 'failed');
  assert.equal(domainState.missionDomainState.hasDomainFailure, true);
}

// Defect 3: Legitimate runtime-attested test receipt must be accepted
function testDefect3() {
  const codeState = { missionDomainState: { hasDomainFailure: false, unverified: true, domainVerdict: 'unverified' } };
  const codeReport = {
    outcome: 'success',
    claims: [{ statement: 'npm test passed after the booking fix.', evidence: ['exec:test-run'] }],
    tests: [{ name: 'npm test after commit', passed: true, evidenceRefs: ['exec:test-run'] }],
    scopeCompletion: { scopeRef: 'mission/quality', completedRefs: ['git:0123456789abcdef0123456789abcdef01234567'] }
  };
  pipeline.applyDomainStateFromEvent({
    state: codeState,
    eventType: 'AGENT_STEP',
    action: 'command_execution',
    event: {
      id: 'execution-event-1',
      action: 'command_execution',
      payload: {
        type: 'item.completed',
        item: {
          id: 'item-test-1',
          type: 'command_execution',
          command: 'npm test',
          status: 'completed',
          exit_code: 0,
          aggregated_output: 'All tests passed.'
        }
      }
    }
  });

  const workerContract = workerKinds.buildWorkerContract('bounded_worker');
  pipeline.applyDomainStateFromEvent({
    state: codeState,
    eventType: 'EVIDENCE_REPORT',
    event: { agentId: 'audit-fixture', payload: codeReport },
    workerContract
  });

  assert.equal(codeReport.tests[0].exitCode, 0);
  assert.ok(codeReport.tests[0].executionReceipt);
  assert.equal(codeState.missionDomainState.domainVerdict, 'completed');
  assert.equal(codeState.missionDomainState.hasDomainFailure, false);
}

// Defect 4: Reply requesting test execution must not be rejected prematurely before execution
function testDefect4() {
  const honest = baseReply();
  honest.tests = ['npm test'];
  assert.doesNotThrow(
    () => synthesis.validateWorkerReply(JSON.stringify(honest), baseState()),
    'Prevalidation must allow replies requesting legitimate test execution'
  );

  const forged = baseReply();
  const fakeTest = { command: 'npm test', exitCode: 0, stdout: 'invented' };
  forged.tests = [fakeTest];
  forged.claims[0].evidence.push('genos://code-test/' + values.digest(fakeTest));
  assert.throws(
    () => synthesis.validateWorkerReply(JSON.stringify(forged), baseState()),
    /dossier.code_fix.unsubstantiated/,
    'Prevalidation must still reject forged receipts'
  );
}

// Defect 5: The word "sans" in "sans modifier l'API" must not bypass the code fix gate
function testDefect5() {
  const neg = baseReply();
  neg.claims[0].statement = 'Le bug est corrigé sans modifier l API';
  assert.throws(
    () => synthesis.validateWorkerReply(JSON.stringify(neg), baseState()),
    /dossier.code_fix.unsubstantiated/,
    '"sans modifier" must not bypass the code fix verification gate'
  );
}

// Defect 6: Recovery persistence failure must not mark memory as duplicate on retry
async function testDefect6() {
  const origEnqueue = durableRecoveryQueue.enqueue;
  let attempts = 0;
  durableRecoveryQueue.enqueue = async () => {
    attempts += 1;
    if (attempts === 1) {
      const err = new Error('SQLITE_BUSY: database is locked');
      err.code = 'SQLITE_BUSY';
      throw err;
    }
    return true;
  };

  const mission = {
    id: 'worker-recovery-test',
    agentId: 'worker-recovery-test',
    missionId: 'm-busy-test',
    orchestratorAgentId: 'orchestrator-main',
    attempt: 0,
    recoveryAttempt: 0,
    communicationRequired: true
  };
  const failureEvent = {
    eventType: 'AGENT_FAILED',
    action: 'ERROR',
    detail: 'Task timeout',
    payload: { category: 'unresolved_task', reason: 'Timeout' }
  };

  try {
    await assert.rejects(
      async () => queueWorkerRecovery(mission, failureEvent),
      /SQLITE_BUSY/,
      'First enqueue attempt must throw SQLITE_BUSY'
    );

    const secondCall = await queueWorkerRecovery(mission, failureEvent);
    assert.equal(attempts, 2, 'Second call must re-attempt durable enqueue');
    assert.equal(secondCall.queued, true, 'Second call must be queued after successful retry');
    assert.notEqual(secondCall.duplicate, true, 'Second call must NOT return duplicate');
  } finally {
    durableRecoveryQueue.enqueue = origEnqueue;
    require('../src/services/agentOrchestrationState').pendingWorkerRecoveries.delete(mission.agentId);
  }
}

async function runAll() {
  testDefect1();
  testDefect2();
  testDefect3();
  testDefect4();
  testDefect5();
  await testDefect6();
  console.log('Worker audit defect regression suite: ALL 6 TESTS PASSED');
}

runAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
