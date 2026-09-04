const assert = require('assert');
const fs = require('fs');
const path = require('path');
const recovery = require('./src/services/workerFailureRecoveryService');

function report(category, attempt = 0, payload = {}) {
  return recovery.failureReport({
    eventType: 'WORKER_TASK_FAILED', detail: 'No verified result',
    payload: { failure: { category, reason: 'approach failed', evidence: ['test failed'] }, ...payload }
  }, {
    agentId: 'worker-1', orchestratorAgentId: 'orchestrator-1', prompt: 'Prove the property',
    recoveryAttempt: attempt, recoveryMaxAttempts: 3
  });
}

assert.equal(recovery.decideRecovery(report('unresolved_task', 0)).action, 'mutate_worker');
assert.equal(recovery.decideRecovery(report('unresolved_task', 1)).action, 'fork_worker');
assert.equal(recovery.decideRecovery(report('unresolved_task', 2)).action, 'replace_worker');
assert.equal(recovery.decideRecovery(report('capability_mismatch', 0)).action, 'replace_worker');
assert.equal(recovery.decideRecovery(report('falsified_hypothesis', 0)).action, 'fork_worker');

const exhausted = recovery.decideRecovery(report('unresolved_task', 3));
assert.equal(exhausted.action, 'escalate_unresolved');
assert.equal(exhausted.terminal, true);
assert.match(exhausted.reason, /without an answer or a proof/i, 'budget exhaustion must remain explicitly unresolved');

const proven = recovery.decideRecovery(report('unresolved_task', 1, {
  noAnswerProof: { method: 'exhaustive enumeration', evidence: ['checked all 16 states'] }
}));
assert.equal(proven.action, 'conclude_no_answer');
assert.equal(proven.retry, false);

const invalidProof = recovery.decideRecovery(report('unresolved_task', 1, {
  noAnswerProof: { method: 'I tried', evidence: [] }
}));
assert.equal(invalidProof.action, 'fork_worker');

assert.equal(recovery.classifyFinalReport({ outcome: 'success', claims: [{ statement: '42', evidence: ['calculation'] }] }).outcome, 'success');
assert.equal(recovery.classifyFinalReport({ outcome: 'failed', claims: [] }).outcome, 'failed');
assert.equal(recovery.classifyFinalReport({ claims: [], uncertainties: ['not solved'] }).outcome, 'failed');
assert.equal(recovery.classifyFinalReport({ outcome: 'no_answer', noAnswerProof: { evidence: [] } }).outcome, 'failed');
assert.equal(recovery.classifyFinalReport({ outcome: 'no_answer', noAnswerProof: { method: 'enumeration', evidence: ['all states checked'] } }).outcome, 'no_answer');

const runtimeSource = fs.readFileSync(path.resolve(__dirname, 'bin/genos-agent-runtime.cjs'), 'utf8');
assert(runtimeSource.includes("eventType: 'WORKER_TASK_FAILED'"), 'semantic worker failures must be emitted to the control plane');
assert(runtimeSource.includes("eventType: 'WORKER_NO_ANSWER_PROVEN'"), 'evidence-backed no-answer conclusions must be explicit');
const adapterSource = fs.readFileSync(path.resolve(__dirname, 'src/services/agentRuntimeAdapter.js'), 'utf8');
assert(adapterSource.includes("'WORKER_RECOVERY_DECISION'"), 'the orchestrator must record its recovery decision');
assert(adapterSource.includes("await dispatchWorkerRecovery(agentId)"), 'a queued recovery must be dispatched after the failed runtime releases its slot');

console.log('Worker failure recovery checks passed.');
