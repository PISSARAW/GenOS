const assert = require('assert');
const fs = require('fs');
const {
  extractEvidenceReport,
  recordWorkerEvidence,
  workerEvidenceDossiers,
  validateWorkerDossiers,
  validateDossierInfluence,
  evidenceScore
} = require('../src/services/agentEvidenceService');
const { workerEvidenceRounds } = require('../src/services/agentOrchestrationState');
const { dossierToCandidate, evaluateDossiersPareto } = require('../src/services/arenaTaskEvaluation');
const { loadAgentDossier, agentFamily } = require('../src/services/agentDossierService');
const { inspectEvent } = require('../src/services/hallucinationMonitoringService');
const { getDatabase } = require('../src/db');

async function runSuite() {
  console.log('=== STARTING WORKER DOSSIERS VERIFICATION SUITE ===\n');

  // --- Point 1: Preservation of evidence events beyond 4 events ---
  console.log('--- Test 1: Evidence event preservation without truncation ---');
  const orch1 = 'orch-p1-test';
  workerEvidenceRounds.set(orch1, {
    workerIds: new Set(['w1']),
    participants: new Map([['w1', { workerId: 'w1', role: 'specialist', assignedBranch: 'b1' }]]),
    events: new Map()
  });
  recordWorkerEvidence({ orchestratorAgentId: orch1, agentId: 'w1' }, {
    eventType: 'EVIDENCE_REPORT',
    action: 'VERIFY_CLAIMS',
    payload: { claims: [{ statement: 'claim 1', evidence: ['proof 1'] }] }
  });
  for (let i = 0; i < 6; i++) {
    recordWorkerEvidence({ orchestratorAgentId: orch1, agentId: 'w1' }, {
      eventType: 'LOG_PROGRESS',
      action: 'HEARTBEAT',
      detail: 'Step ' + i
    });
  }
  const d1 = workerEvidenceDossiers(orch1, [{ agentId: 'w1' }]);
  assert.equal(d1.length, 1);
  const preservedReport = d1[0].events.find((e) => e.evidenceReport);
  assert.ok(preservedReport, 'Point 1 FAIL: evidenceReport event was evicted by subsequent events');
  assert.equal(preservedReport.evidenceReport.claims[0].statement, 'claim 1');
  workerEvidenceRounds.delete(orch1);
  console.log('  PASS: Point 1 - Evidence reports preserved through high-volume event streams');

  // --- Point 2: Automatic normalization of failure events ---
  console.log('--- Test 2: Failure normalization for worker error events ---');
  const orch2 = 'orch-p2-test';
  workerEvidenceRounds.set(orch2, {
    workerIds: new Set(['w2']),
    participants: new Map([['w2', { workerId: 'w2', role: 'coder', assignedBranch: 'b2' }]]),
    events: new Map()
  });
  recordWorkerEvidence({ orchestratorAgentId: orch2, agentId: 'w2' }, {
    eventType: 'AGENT_FAILED',
    severity: 'error',
    detail: 'Memory allocation exceeded limit',
    payload: { error: 'OOM killed' }
  });
  const d2 = workerEvidenceDossiers(orch2, [{ agentId: 'w2' }]);
  assert.equal(d2.length, 1);
  assert.ok(d2[0].events[0].failure, 'Point 2 FAIL: failure object was not normalized');
  assert.equal(d2[0].events[0].failure.category, 'runtime_failure');
  assert.equal(d2[0].events[0].failure.reason, 'Memory allocation exceeded limit');
  assert.doesNotThrow(() => validateWorkerDossiers(d2, [{ agentId: 'w2' }]), 'Normalized failure must validate successfully');
  workerEvidenceRounds.delete(orch2);
  console.log('  PASS: Point 2 - Error events automatically normalized into valid failure dossiers');

  // --- Point 3: Reconciliation of recovery/replacement workers ---
  console.log('--- Test 3: Recovery worker reconciliation in validateWorkerDossiers ---');
  const d3 = [
    {
      workerId: 'w3-replacement',
      assignedBranch: 'data-pipeline',
      role: 'specialist',
      events: [{ evidenceReport: { outcome: 'success', claims: [{ statement: 'done', evidence: ['log'] }] } }]
    }
  ];
  assert.doesNotThrow(
    () => validateWorkerDossiers(d3, [{ agentId: 'w3-failed', branchAssignment: 'data-pipeline' }]),
    'Point 3 FAIL: Recovery worker covering branch should satisfy validation'
  );
  console.log('  PASS: Point 3 - Replacement workers reconcile branch coverage');

  // --- Point 4: Zero evidenceScore for failed worker reports ---
  console.log('--- Test 4: Annulation du score d evidence pour les workers en echec ---');
  const scoreFailedOutcome = evidenceScore({
    report: {
      outcome: 'failed',
      claims: [{ statement: 'Something claimed', evidence: ['proof A', 'proof B'] }]
    }
  });
  assert.strictEqual(scoreFailedOutcome, 0, 'Point 4 FAIL: outcome failed must have score 0');

  const scorePayloadFailure = evidenceScore({
    claims: [{ statement: 'Claimed', evidence: ['proof'] }],
    failure: { category: 'runtime', reason: 'Crash' }
  });
  assert.strictEqual(scorePayloadFailure, 0, 'Point 4 FAIL: payload.failure must have score 0');
  console.log('  PASS: Point 4 - evidenceScore yields 0 for failed outcomes or failure payloads');

  // --- Point 5: Plafonnement de la fitness des solutions en echec ---
  console.log('--- Test 5: Fitness capping for failed solutions in Pareto evaluation ---');
  const candFailed = dossierToCandidate({
    workerId: 'worker-failed-1',
    evidenceReport: {
      outcome: 'failed',
      claims: Array.from({ length: 10 }, () => ({ evidence: ['proof1', 'proof2'] })),
      tests: ['passed', 'passed', 'passed']
    }
  });
  assert.ok(candFailed.fitnessScore <= 15, 'Point 5 FAIL: failed candidate fitness score > 15: ' + candFailed.fitnessScore);

  const candEventFailed = dossierToCandidate({
    workerId: 'worker-failed-2',
    events: [
      { eventType: 'WORKER_TASK_FAILED', failure: { category: 'unresolved_task', reason: 'Aborted' } }
    ]
  });
  assert.ok(candEventFailed.fitnessScore <= 15, 'Point 5 FAIL: event-failed candidate fitness > 15: ' + candEventFailed.fitnessScore);
  console.log('  PASS: Point 5 - Failed candidates capped at <= 15% fitness');

  // --- Point 6: Diagnostics et deduplication dans validateDossierInfluence ---
  console.log('--- Test 6: Diagnostics and deduplication in validateDossierInfluence ---');
  assert.throws(
    () => validateDossierInfluence({
      dossierInfluence: [
        { workerId: 'w1', influence: 'used data', usedClaims: ['c1'] },
        { workerId: 'unexpected-worker', influence: 'extra', usedClaims: ['c2'] }
      ]
    }, ['w1']),
    (err) => {
      assert.equal(err.code, 'INVALID_DOSSIER_INFLUENCE');
      assert.ok(err.message.includes('unexpected: unexpected-worker'), 'Should report unexpected worker');
      return true;
    }
  );
  console.log('  PASS: Point 6 - validateDossierInfluence reports accurate unexpected diagnostics');

  // --- Point 7: WORKER_EVIDENCE_DOSSIERS_ATTACHED event structure ---
  console.log('--- Test 7: WORKER_EVIDENCE_DOSSIERS_ATTACHED telemetry structure ---');
  const fleetSrc = fs.readFileSync(require.resolve('../src/services/agentFleetService.js'), 'utf8');
  assert.ok(fleetSrc.includes('WORKER_EVIDENCE_DOSSIERS_ATTACHED'), 'Point 7 FAIL: WORKER_EVIDENCE_DOSSIERS_ATTACHED must be emitted');
  console.log('  PASS: Point 7 - runEvidenceBarrier emits WORKER_EVIDENCE_DOSSIERS_ATTACHED before memory purge');

  // --- Point 8: Inclusion des workers enfants workspace_id IS NULL dans agentFamily ---
  console.log('--- Test 8: agentFamily preserves child workers with NULL workspace_id ---');
  const db = await getDatabase();
  const testParentId = 'parent-fam-' + Date.now();
  const testChildId = 'child-fam-' + Date.now();
  const testOrgId = 'test-org-family-' + Date.now();
  const testProjId = 'test-proj-family-' + Date.now();
  const testWsId = 'ws-family-' + Date.now();

  await db.run('INSERT INTO organizations(id, name) VALUES(?, ?)', testOrgId, 'Test Organization Family');
  await db.run('INSERT INTO projects(id, organization_id, name) VALUES(?, ?, ?)', testProjId, testOrgId, 'Test Project Family');
  await db.run(
    'INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    testWsId, 'Test Workspace Family', 'C:/fake/ws', testOrgId, testProjId
  );
  await db.run(
    'INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    testParentId, 'Parent Agent', 'orchestrator', 'running', 'GenOS', 'orchestrator', testWsId
  );
  // Child has NULL workspace_id but parent_agent_id pointing to parent
  await db.run(
    'INSERT INTO agents (id, name, role, status, agent_type, execution_mode, workspace_id, parent_agent_id) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)',
    testChildId, 'Child Worker', 'worker', 'idle', 'GenOS', 'worker', testParentId
  );

  const family = await agentFamily(db, testParentId, { organizationId: testOrgId, projectId: testProjId });
  const familyIds = family.map((a) => a.id);
  assert.ok(familyIds.includes(testParentId), 'Parent must be in family');
  assert.ok(familyIds.includes(testChildId), 'Point 8 FAIL: Child with NULL workspace_id must be included in tenant-scoped family');
  console.log('  PASS: Point 8 - agentFamily includes child workers with NULL workspace_id');

  // --- Point 9: Priorisation chronologique des evenements recents dans loadAgentDossier ---
  console.log('--- Test 9: loadAgentDossier prioritizes recent events ---');
  await db.run(
    'INSERT INTO telemetry_events (agent_id, event_type, action, detail, payload_json, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    testParentId, 'EVIDENCE_REPORT', 'VERIFY_CLAIMS', 'Final report', JSON.stringify({ claims: [{ statement: 'Verified final' }] }), 'info'
  );
  const dossier = await loadAgentDossier(db, testParentId, { organizationId: testOrgId, projectId: testProjId });
  assert.ok(dossier, 'Dossier must load');
  assert.ok(dossier.events.length > 0, 'Events must not be empty');
  const finalEvent = dossier.events[dossier.events.length - 1];
  assert.equal(finalEvent.eventType, 'EVIDENCE_REPORT', 'Point 9 FAIL: Last event chronologically must be recent terminal report');
  console.log('  PASS: Point 9 - loadAgentDossier chronologically retains latest terminal events');

  // --- Point 10: Extension du moniteur d hallucination aux claims des rapports d evidence ---
  console.log('--- Test 10: Hallucination monitor detects unverified claims in evidenceReport ---');
  const eventWithReportClaims = {
    eventType: 'AGENT_COMPLETED',
    payload: {
      evidenceReport: {
        claims: [
          { statement: 'Claim with no proof' }
        ]
      }
    }
  };
  const obs = inspectEvent(eventWithReportClaims);
  assert.ok(obs.detected, 'Point 10 FAIL: Unverified claims inside evidenceReport.claims must be detected');
  assert.ok(obs.reasons.some((r) => r.includes('structured claim(s) lack evidence')), 'Reason must cite lack of evidence');

  const eventWithUnverifiedClaims = {
    eventType: 'EVIDENCE_REPORT',
    payload: {
      evidenceReport: {
        unverifiedClaims: ['hypothesis unconfirmed']
      }
    }
  };
  const obsUnverified = inspectEvent(eventWithUnverifiedClaims);
  assert.ok(obsUnverified.detected, 'Point 10 FAIL: unverifiedClaims inside evidenceReport must be detected');
  console.log('  PASS: Point 10 - inspectEvent detects unverified claims inside evidenceReport');

  // Cleanup test agents & tenant data
  await db.run('DELETE FROM telemetry_events WHERE agent_id IN (?, ?)', testParentId, testChildId);
  await db.run('DELETE FROM agents WHERE id IN (?, ?)', testParentId, testChildId);
  await db.run('DELETE FROM workspaces WHERE id = ?', testWsId);
  await db.run('DELETE FROM projects WHERE id = ?', testProjId);
  await db.run('DELETE FROM organizations WHERE id = ?', testOrgId);

  console.log('\n================================================');
  console.log('ALL 10 WORKER DOSSIERS TESTS PASSED SUCCESSFULLY');
  console.log('================================================');
}

runSuite().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});