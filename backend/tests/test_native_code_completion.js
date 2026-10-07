'use strict';

const { seed } = require('./test_bounded_worker_delegation');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'p1-code-oracle-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const values = require('../src/services/trinityProvenanceValues');
const journal = require('../src/services/epistemic/nativeOracleJournal');
const { getDatabase, closeDatabase } = require('../src/db');

async function dispatch(db, method) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Verify the recorded code against the bounded contract', workerKind: 'verifier_worker',
      methodContract: method, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const authority = row && await require('../src/services/missionEnvelopeAuthority').read(db, row.id);
  return { result, row, authority, request: row && { runId: row.id, agentId: row.agent_id, scope: authority.envelope.scope } };
}

async function fixture(probe) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-code-oracle-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
  const expression = '((a % b) + b) % b';
  await fs.writeFile(path.join(workspace, 'src/answer.gexpr'), expression);
  process.env.GENOS_DB_PATH = path.join(root, 'code.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  const method = { version: 1, methodId: 'verify_code_postconditions', parameters: {
    artifactPath: 'src/answer.gexpr', contractId: 'euclidean_modulo_v1', expectedContentHash: values.hashBytes(Buffer.from(expression)) } };
  try { await seed(db, workspace, { problemProfile: { reversibility: 'low' } }); await probe(db, { method, workspace, root }); }
  finally { await require('../src/services/garageRuntimeService').stop(db); await closeDatabase(); await fs.rm(root, { recursive: true, force: true }); }
}

async function positive(db, { method }) {
  const checked = await dispatch(db, method);
  assert.equal(checked.row.status, 'awaiting_approval', JSON.stringify(checked));
  const attested = await journal.read(db, { ...checked.request, kind: 'attestation' });
  assert.equal(attested.value.domain, 'code_postconditions');
  assert.equal(attested.value.accepted, true);
  assert.equal(attested.value.costs.processes, 2);
  assert.equal(attested.value.costs.complete, true);
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 2);
  const assembly = await require('../src/services/aeisAssemblyStore').readAssembly(db, attested.value.assemblyId);
  for (const receipt of assembly.evaluation.assembly.verifications) {
    const observed = receipt.executionEvidence[0];
    assert.equal(observed.postconditions.coverage.checkedCases, 264);
    assert.equal(observed.subject.artifactContentHash, method.parameters.expectedContentHash);
    assert.ok(observed.processId > 0);
  }
  const options = { humanApprovalReceipt: { approved: true, approvalId: `code-${checked.row.id}`, approverId: 'independent-test-human',
    approvedAt: new Date().toISOString(), payloadHash: values.digest({ runId: checked.row.id }) } };
  const execution = require('../src/services/strategyExecutionService');
  assert.equal((await execution.approveRun(db, checked.row.id, options)).status, 'completed');
  assert.equal((await execution.approveRun(db, checked.row.id, options)).status, 'completed');
  const view = await require('../src/services/consumerInspectionService').inspect(db,
    { runId: checked.row.id, scope: checked.request.scope });
  assert.equal(view.nativeVerification.current.satisfied, true);
  await require('./helpers/nativeCodeProofProbes').qualify(db, checked);
  console.log('Native code: actual artifact, 264 postconditions in two fresh processes, own budget, nonces and real approval passed.');
}

async function main() {
  const probes = require('./helpers/nativeCodeOracleProbes');
  const boundaries = require('./helpers/nativeCodeBoundaryProbes');
  const cases = { positive, refutation: probes.refutation, unsupported: probes.unsupported,
    changed: probes.changed, ...boundaries.inputCases(), wrongHash: boundaries.wrongHash,
    links: boundaries.links, budget: boundaries.budget,
    signedCoverage: require('./helpers/nativeCodeSignedCoverageProbe').qualify };
  if (process.argv[2]) return fixture(cases[process.argv[2]]);
  for (const name of Object.keys(cases)) {
    const child = require('node:child_process').spawnSync(process.execPath, [__filename, name],
      { stdio: 'inherit', timeout: 60000, windowsHide: true });
    assert.equal(child.status, 0, `Native code oracle probe ${name} failed`);
  }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { dispatch, fixture, positive };
