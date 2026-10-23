'use strict';

const assert = require('node:assert/strict');
const { verifyEvidenceContract, workerCompletionEvidence, rootCompletionEvidence,
  attachCompletionEvidence, settled, candidateWorkspace, candidateWorkspaces, selectVerifiedCandidate } = require('../src/services/ontogenesis/missionCompletion');

const rejected = verifyEvidenceContract({ requiresEvidenceBeforePromotion: true }, {
  context: { evidence: ['agent_completed'] }
});
assert.deepEqual(rejected, { allowed: false, reason: 'verifier-receipt-independant-requis' });

const accepted = verifyEvidenceContract({ requiresEvidenceBeforePromotion: true }, {
  context: { evidence: ['evidence_report'], flags: { verifierReceiptPresent: true } }
});
assert.equal(accepted, null);

const explicitlyWaived = verifyEvidenceContract({ requiresEvidenceBeforePromotion: false }, {
  context: { evidence: [] }
});
assert.equal(explicitlyWaived, null);

async function durableIdleWorkerEvidence() {
  const report = { outcome: 'success', claims: [{ statement: 'verified change', evidence: ['genos://code-file/a'] }],
    scopeCompletion: { completedRefs: ['genos://code-file/a'] },
    tests: [{ command: 'node verify.cjs', exitCode: 0, signal: null }],
    workerArtifact: { type: 'dossier', content: { claims: [{ statement: 'verified change' }] },
      provenance: { source: 'worker-runtime', workspaceRoot: '/workspace', sourceRefs: ['genos://code-file/a'] } } };
  const runId = 'strategy_run_verified';
  const events = [
    { event_type: 'AGENT_COMPLETED', payload_json: JSON.stringify({ executionRunId: runId,
      identityReceipt: { success: true }, evidenceReport: report }) },
    { event_type: 'EVIDENCE_REPORT', payload_json: JSON.stringify({ executionRunId: runId, evidenceReport: report }) }
  ];
  const db = { all: async () => events };
  const worker = { id: 'worker-1', execution_mode: 'worker', status: 'idle', runtime_pid: null };
  assert.equal(await workerCompletionEvidence(db, worker), true);
  const agents = await attachCompletionEvidence(db, { id: 'root' }, [worker]);
  assert.equal(agents[0].missionCompletionEvidenceVerified, true);
  assert.equal(settled(agents), true);
  assert.equal(candidateWorkspace([{ ...agents[0], workspace_path: '/workspace' }], 'root'), '/workspace');
  const workerCandidates = [
    { ...agents[0], id: 'worker-b', workspace_path: '/candidate-b' },
    { ...agents[0], id: 'worker-a', workspace_path: '/candidate-a' }
  ];
  assert.deepEqual(candidateWorkspaces(workerCandidates, 'root'), ['/candidate-a', '/candidate-b']);
  const checked = [];
  const selected = await selectVerifiedCandidate({ candidates: candidateWorkspaces(workerCandidates, 'root'),
    missionId: 'mission', checks: [{ program: 'node', args: ['verify.cjs'] }], allowExecution: true,
    createReceipt: async ({ workspaceRoot }) => ({ workspaceRoot }),
    validateReceipt: async (receipt) => { checked.push(receipt.workspaceRoot); return receipt.workspaceRoot === '/candidate-b'; } });
  assert.deepEqual(checked, ['/candidate-a', '/candidate-b']);
  assert.equal(selected.candidateWorktree, '/candidate-b');
  assert.deepEqual(selected.verifierReceipt, { workspaceRoot: '/candidate-b' });
  const rejectedCandidates = await selectVerifiedCandidate({ candidates: ['/candidate-a'], missionId: 'mission',
    checks: [{ program: 'node', args: ['verify.cjs'] }], allowExecution: true,
    createReceipt: async () => ({ invalid: true }), validateReceipt: async () => false });
  assert.deepEqual(rejectedCandidates, { candidateWorktree: null, verifierReceipt: null });
  assert.equal(await rootCompletionEvidence(db, { id: 'root', runtime_pid: null }), true);
  assert.equal(await workerCompletionEvidence(db, { ...worker, runtime_pid: 12 }), false,
    'a live worker cannot be treated as settled from an early report');
  const forgedDb = { all: async () => [{ ...events[0], payload_json: JSON.stringify({
    executionRunId: runId, identityReceipt: { success: false }, evidenceReport: report }) }, events[1]] };
  assert.equal(await workerCompletionEvidence(forgedDb, worker), false,
    'a dossier without a successful identity receipt cannot settle an idle worker');
}

durableIdleWorkerEvidence().then(() => {
  process.stdout.write('mission completion evidence gate assertions passed\n');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
