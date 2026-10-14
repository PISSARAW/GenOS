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
const fossilization = require('../src/services/fossilizationService');
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
  const forged = await innovation.captureAndEvaluate(db, captureRequest);
  assert.equal(forged.status, 'candidate');
  assert.equal(forged.evaluation.eligible, false, 'A client-asserted fossil hash is not proof.');
  await assert.rejects(
    () => innovation.promoteCandidate(db, forged.id, 'operator-test'),
    error => error.code === 'INNOVATION_GATE_BLOCKED'
  );

  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json)
    VALUES ('event_innovation_fossil', 'innovation-source-lineage', 'AGENT_TERMINATED', 'TERMINATE', 'terminal', '{}')`);
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json, organization_id, project_id)
    VALUES ('event_scoped_fossil', 'scoped-innovation-lineage', 'AGENT_TERMINATED', 'TERMINATE', 'terminal', '{}', 'org-innovation', 'project-innovation')`);
  const fossil = await fossilization.recordFossil({
    lineageId: 'innovation-source-lineage',
    sourceEventId: 'event_innovation_fossil',
    fossilId: 'fossil-test-innovation-verified',
    hardParts: ['genos_sandbox_exec']
  }, db, { writeArtifact: false });
  assert.equal(fossil.success, true);
  const scopedFossil = await fossilization.recordFossil({
    lineageId: 'scoped-innovation-lineage',
    sourceEventId: 'event_scoped_fossil',
    fossilId: 'fossil-test-innovation-scoped',
    hardParts: ['genos_sandbox_exec'],
    organizationId: 'org-innovation',
    projectId: 'project-innovation'
  }, db, { writeArtifact: false });
  const scopedConcepts = innovation.fossilConcepts(scopedFossil.fossil);
  const wrongHash = await innovation.captureAndEvaluate(db, {
    baseGenomeRef: 'EvidenceLedger', name: 'wrong-hash', concept: 'genos_sandbox_exec',
    concepts: scopedConcepts, sourceAgentId: 'operator-test', scope: { organizationId: 'org-innovation', projectId: 'project-innovation' },
    evidence: { source: 'stratigraphic_fossil', fossilId: scopedFossil.fossil.fossil_id, payloadHash: 'forged', integrityVerified: true }
  });
  assert.equal(wrongHash.evaluation.checks.sourceEvidence, false, 'A forged hash on a real fossil is rejected.');
  const crossTenant = await innovation.captureAndEvaluate(db, {
    baseGenomeRef: 'EvidenceLedger', name: 'cross-tenant', concept: 'genos_sandbox_exec',
    concepts: scopedConcepts, sourceAgentId: 'operator-test', scope: { organizationId: 'org-other', projectId: 'project-other' },
    evidence: { source: 'stratigraphic_fossil', fossilId: scopedFossil.fossil.fossil_id, payloadHash: scopedFossil.fossil.payload_hash, integrityVerified: true }
  });
  assert.equal(crossTenant.evaluation.checks.sourceEvidence, false, 'Fossil evidence cannot cross tenant scope.');
  const captured = await innovation.captureFromFossil({
    db,
    record: fossil.fossil,
    integrityVerified: true,
    baseGenomeRef: 'EvidenceLedger'
  });
  assert.ok(captured.candidateGenomeRef);
  assert.equal(captured.status, 'candidate');
  assert.equal(captured.evaluation.checks.sourceEvidence, true);
  assert.equal(captured.evaluation.eligible, false, 'A fossil concept still has to improve the parent genome.');

  const candidate = await store.loadGenome(db, captured.candidateGenomeRef);
  assert.ok(candidate.genes.FOSSIL_GENOS_SANDBOX_EXEC);

  const auto = await store.selectGenome(db, { role: 'historian' }, null);
  assert.ok(auto);
  assert.notEqual(auto.id, captured.candidateGenomeRef);
  assert.equal(await store.selectGenome(db, { genomeRef: captured.candidateGenomeRef, role: 'historian' }, null), null);

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
  await db.run(`INSERT INTO telemetry_events
    (agent_id, event_type, action, detail, severity, payload_json)
    VALUES ('agent-capture', 'AGENT_COMPLETED', 'COMPLETE', 'worker completed', 'info', ?)`,
  JSON.stringify(successEvent.payload));
  const forgedWorkerCapture = await innovation.captureAndEvaluate(db, {
    baseGenomeRef: 'EvidenceLedger', name: 'forged-worker', concept: 'genos_sandbox_exec',
    concepts: novel, sourceAgentId: 'agent-capture', scope: {},
    evidence: {
      source: 'validated_worker_success', executionRunId: 'fabricated-run',
      eventType: 'AGENT_COMPLETED',
      payload: { evidenceReport: { claims: [{ evidence: ['caller assertion'] }] } },
      contributionEvidence: { TOOL_GENOS_SANDBOX_EXEC: { observed: true } }
    }
  });
  assert.equal(forgedWorkerCapture.evaluation.checks.sourceEvidence, false, 'Caller-supplied worker success and observed flags are not proof.');
  const innovationCapture = await innovation.captureFromSuccess({
    db,
    mission: { agentId: 'agent-capture', prompt: 'historian research', toolLease: ['genos_sandbox_exec'] },
    event: successEvent
  });
  assert.ok(innovationCapture && innovationCapture.candidateGenomeRef);
  assert.equal(innovationCapture.status, 'evaluated');
  assert.equal(innovationCapture.evaluation.checks.sourceEvidence, true);
  assert.deepEqual(innovationCapture.evaluation.failures, []);
  const evaluation = await innovation.evaluateCandidate(db, innovationCapture.id);
  assert.equal(evaluation.evaluation.eligible, true);
  assert.equal(evaluation.evaluation.trustReason, 'signature_not_required');
  await assert.rejects(
    () => innovation.promoteCandidate(db, innovationCapture.id),
    error => error.code === 'INNOVATION_OPERATOR_REQUIRED'
  );
  await db.run(`UPDATE telemetry_events SET payload_json = '{}'
    WHERE agent_id = 'agent-capture' AND event_type = 'AGENT_COMPLETED'`);
  await assert.rejects(
    () => innovation.promoteCandidate(db, innovationCapture.id, 'operator-test'),
    error => error.code === 'INNOVATION_GATE_BLOCKED'
  );
  await db.run(`UPDATE telemetry_events SET payload_json = ?
    WHERE agent_id = 'agent-capture' AND event_type = 'AGENT_COMPLETED'`, JSON.stringify(successEvent.payload));
  const promoted = await innovation.promoteCandidate(db, innovationCapture.id, 'operator-test');
  assert.equal(promoted.status, 'promoted');
  const audit = await db.get('SELECT actor FROM audit_logs WHERE action = ? AND resource = ?', 'GENOME_INNOVATION_PROMOTED', `genome-innovations/${innovationCapture.id}`);
  assert.equal(audit.actor, 'operator-test');
  assert.ok(await store.selectGenome(db, { genomeRef: innovationCapture.candidateGenomeRef }, null));
  const deployment = await store.workerGenesForAssignment(db, { genomeRef: innovationCapture.candidateGenomeRef }, {});
  assert.ok(deployment);
  assert.ok(deployment.selectionId);
  const selection = await db.get('SELECT innovation_id FROM agent_genome_selections WHERE id = ?', deployment.selectionId);
  assert.equal(selection.innovation_id, innovationCapture.id);
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
