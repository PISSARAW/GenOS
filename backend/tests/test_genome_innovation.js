const assert = require('assert');
const os = require('os');
const path = require('path');

process.env.GENOS_DB_PATH = path.join(os.tmpdir(), `genos-genome-innov-${Date.now()}.db`);
process.env.GENOS_ADMIN_PASSWORD = 'test-admin-password-123';
process.env.GENOS_ADMIN_TOKEN = 'test-admin-token-123';
process.env.GENOS_AGENT_DNA = '1';

const { getDatabase, closeDatabase } = require('../src/db');
const store = require('../src/services/agentDnaStore');
const innovation = require('../src/services/agentDnaInnovation');
const { migrateBodyActionReceipts } = require('../src/db/migrations/migrateBodyActionReceipts');

async function run() {
  const db = await getDatabase();
  await store.importDirectory(db, path.resolve(__dirname, '../../agents/dna/fondations'), {});

  const base = await store.loadGenome(db, 'EvidenceLedger');
  const novel = innovation.detectNovelConcepts(base, ['genos_inspect', 'genos_sandbox_exec']);
  assert.deepEqual(novel, [{ locus: 'TOOL_GENOS_SANDBOX_EXEC', instruction: 'genos_sandbox_exec' }]);

  const captureRequest = {
    baseGenomeRef: 'EvidenceLedger',
    name: 'EvidenceLedger-sandbox',
    concept: 'genos_sandbox_exec',
    concepts: novel,
    sourceAgentId: 'agent-innov',
    evidence: {
      source: 'stratigraphic_fossil',
      fossilId: 'fossil-test-innovation',
      payloadHash: 'verified-payload-hash',
      integrityVerified: true
    },
    scope: {}
  };
  const captured = await innovation.captureAndEvaluate(db, captureRequest);
  assert.ok(captured.candidateGenomeRef);
  assert.equal(captured.status, 'evaluated');
  assert.equal(captured.evaluation.eligible, true);

  const candidate = await store.loadGenome(db, captured.candidateGenomeRef);
  assert.ok(candidate.genes.TOOL_GENOS_SANDBOX_EXEC);

  const auto = await store.selectGenome(db, { role: 'historian' }, null);
  assert.ok(auto);
  assert.notEqual(auto.id, captured.candidateGenomeRef);
  assert.equal(await store.selectGenome(db, { genomeRef: captured.candidateGenomeRef, role: 'historian' }, null), null);

  const evaluation = await innovation.evaluateCandidate(db, captured.id);
  assert.equal(evaluation.evaluation.eligible, true);
  assert.deepEqual(evaluation.evaluation.failures, []);
  assert.equal(evaluation.evaluation.trustReason, 'signature_not_required');
  assert.equal(evaluation.status, 'evaluated');
  await assert.rejects(
    () => innovation.promoteCandidate(db, captured.id),
    error => error.code === 'INNOVATION_OPERATOR_REQUIRED'
  );
  const promoted = await innovation.promoteCandidate(db, captured.id, 'operator-test');
  assert.equal(promoted.status, 'promoted');
  const audit = await db.get('SELECT actor FROM audit_logs WHERE action = ? AND resource = ?', 'GENOME_INNOVATION_PROMOTED', `genome-innovations/${captured.id}`);
  assert.equal(audit.actor, 'operator-test');
  assert.ok(await store.selectGenome(db, { genomeRef: captured.candidateGenomeRef }, null));
  const deployment = await store.workerGenesForAssignment(db, { genomeRef: captured.candidateGenomeRef }, {});
  assert.ok(deployment);
  assert.ok(deployment.selectionId);
  const selection = await db.get('SELECT innovation_id FROM agent_genome_selections WHERE id = ?', deployment.selectionId);
  assert.equal(selection.innovation_id, captured.id);
  const rejectedCandidate = await innovation.captureCandidate(db, {
    ...captureRequest,
    name: 'EvidenceLedger-rejected-sandbox'
  });
  const rejected = await innovation.rejectCandidate(db, rejectedCandidate.id, {
    reason: 'test_rejection',
    operatorId: 'operator-test'
  });
  assert.equal(rejected.status, 'rejected');
  const rejectionAudit = await db.get('SELECT actor, reason FROM audit_logs WHERE action = ? AND resource = ?', 'GENOME_INNOVATION_REJECTED', `genome-innovations/${rejectedCandidate.id}`);
  assert.deepEqual(rejectionAudit, { actor: 'operator-test', reason: 'test_rejection' });
  assert.equal(await store.selectGenome(db, { genomeRef: rejectedCandidate.candidateGenomeRef }, null), null);
  const listed = await innovation.listInnovations(db, {});
  assert.ok(listed.length >= 1);

  await db.run("INSERT INTO agents (id, name, role, status) VALUES ('agent-capture', 'Capture worker', 'historian', 'completed')");
  await db.run("INSERT INTO agents (id, name, role, status) VALUES ('agent-no-use', 'Unused worker', 'historian', 'completed')");
  await db.run(`INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json)
    VALUES ('orchestrator-capture', 'WORKER_CAPABILITY_LEASED', 'LEASE', 'worker lease', ?)` ,
  JSON.stringify({ workerId: 'agent-capture', toolLease: ['genos_sandbox_exec'] }));
  assert.deepEqual(await innovation.latestToolLease(db, 'agent-capture'), ['genos_sandbox_exec']);
  await migrateBodyActionReceipts(db);
  await db.run(`INSERT INTO body_action_receipts
    (action_id, agent_id, mission_id, run_id, effector_id, authority_hash, prediction_json, outcome_json, phase)
    VALUES ('capture-action', 'agent-capture', 'mission-capture', 'run-capture', 'direct_mcp_call', 'authority', ?, ?, 'observed')`,
  JSON.stringify({ toolName: 'genos_sandbox_exec' }), JSON.stringify({ status: 'completed' }));
  await db.run(`INSERT INTO body_action_receipts
    (action_id, agent_id, mission_id, run_id, effector_id, authority_hash, prediction_json, outcome_json, phase)
    VALUES ('unrelated-action', 'agent-no-use', 'mission-other', 'run-other', 'direct_mcp_call', 'authority', ?, ?, 'observed')`,
  JSON.stringify({ toolName: 'genos_sandbox_exec' }), JSON.stringify({ status: 'completed' }));
  const successEvent = {
    eventType: 'AGENT_COMPLETED', severity: 'info',
    payload: { executionRunId: 'run-capture', evidenceReport: { claims: [{ evidence: ['verified result'] }] } }
  };
  const innovationCapture = await innovation.captureFromSuccess({
    db,
    mission: { agentId: 'agent-capture', prompt: 'historian research', toolLease: ['genos_sandbox_exec'] },
    event: successEvent
  });
  assert.ok(innovationCapture && innovationCapture.candidateGenomeRef);
  const noUsageCapture = await innovation.captureFromSuccess({
    db,
    mission: { agentId: 'agent-no-use', prompt: 'historian research', toolLease: ['genos_sandbox_exec'] },
    event: { ...successEvent, payload: { ...successEvent.payload, executionRunId: 'run-no-use' } }
  });
  assert.equal(noUsageCapture, null, 'A lease without a successful observed receipt must not demonstrate tool use.');

  await closeDatabase();
  console.log('Genome innovation checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
