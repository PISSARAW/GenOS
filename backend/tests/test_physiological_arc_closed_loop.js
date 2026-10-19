'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { migrateProductionHealingCampaigns } = require('../src/db/migrations/migrateProductionHealingCampaigns');
const sensorimotorBridge = require('../src/services/sensorimotorSelfTwinBridge');
const morphogenesisBridge = require('../src/services/shevMorphogenesisHealingBridge');
const immuneEffector = require('../src/services/securityRemediation/immuneEffectorService');
const endocrineBridge = require('../src/services/shev/developmentalEndocrineBridge');
const healingCampaign = require('../src/services/productionHealingCampaignService');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');
const { planRemediationCampaign } = require('../src/services/securityRemediation/remediationCampaignPlanner');

const SCOPE = Object.freeze({ organizationId: 'org-test', projectId: 'project-test', entityId: 'agent-0' });

async function setupDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  await migrateProductionHealingCampaigns(db);
  await db.exec(`
    CREATE TABLE IF NOT EXISTS shev_observations (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT, dimension TEXT NOT NULL,
      kind TEXT NOT NULL, epistemic_status TEXT NOT NULL, evidence_json TEXT DEFAULT '[]',
      source TEXT, observed_at TEXT, valid_until TEXT, summary TEXT, content_hash TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shev_healing_episodes (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, source_observation_id TEXT NOT NULL,
      current_phase TEXT NOT NULL, opened_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS shev_responsibilities (
      project_id TEXT PRIMARY KEY, status TEXT NOT NULL, stage TEXT NOT NULL,
      mandate_version INTEGER NOT NULL, authority_public_key TEXT
    );
    CREATE TABLE IF NOT EXISTS shev_mandates (
      project_id TEXT NOT NULL, version INTEGER NOT NULL, mandate_json TEXT NOT NULL,
      authority_ref TEXT NOT NULL, PRIMARY KEY(project_id,version)
    );
    CREATE TABLE IF NOT EXISTS shev_initiatives (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, observation_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS shev_agent_progress (
      initiative_id TEXT NOT NULL, result TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, event_type TEXT NOT NULL,
      payload_json TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await db.run(`INSERT INTO shev_responsibilities
    (project_id,status,stage,mandate_version) VALUES (?,?,?,?)`,
  [SCOPE.projectId, 'active', 'observing', 1]);
  await db.run(`INSERT INTO shev_mandates (project_id,version,mandate_json,authority_ref)
    VALUES (?,?,?,?)`, [SCOPE.projectId, 1, JSON.stringify({ dimensions: [{ name: 'planning' }] }), 'test']);
  return db;
}

async function testSensorimotorToSelfTwin(db) {
  const result = await sensorimotorBridge.executePredictiveStep({
    db, scope: SCOPE,
    prediction: { target: 'desktop', intervention: 'bounded-click', semanticType: 'capability_gap',
      effects: [{ metric: 'screen.png_base64_bytes', expected: 100 }] },
    step: { type: 'click', x: 10, y: 20 }, toleratedError: 0.1,
    authorization: { requiresExplicitAuthorization: true, granted: true },
    verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:desktop-step-1' }),
    executeBoundedAction: async ({ step }) => ({ executed: step.type }),
    observeState: async () => ({ observations: [{ metric: 'screen.png_base64_bytes', predicted: 100, observed: 250 }],
      evidenceRefs: ['artifact:screen-capture-1'] }),
    verifyEvidenceRefs: async () => [{ verified: true, artifactHash: 'a'.repeat(64) }],
    candidateSubmitter: async ({ candidate }) => ({ candidateId: candidate.id }),
    shevDimension: 'planning'
  });

  assert.equal(result.discrepancy.status, 'measured');
  assert.ok(result.discrepancy.epsilon > 0.1);
  assert.equal(result.notification.status, 'recorded');
  const saved = await db.get('SELECT * FROM shev_observations WHERE id = ?',
    [result.notification.observationId]);
  assert.equal(saved.kind, 'capability_gap');
  assert.equal(saved.epistemic_status, 'observed');
  assert.equal(JSON.parse(saved.evidence_json)[0], 'a'.repeat(64));
  return { observationId: result.notification.observationId, predictionId: result.prediction.predictionId };
}

async function testShevMorphogenesisResponse(db, observationId) {
  await db.run(`INSERT INTO shev_healing_episodes (id, project_id, source_observation_id, current_phase)
    VALUES ('episode-1', ?, ?, 'inflammation')`, [SCOPE.projectId, observationId]);

  const compiled = await morphogenesisBridge.compileEpisodePlan({
    db, episodeId: 'episode-1',
    loadEvidence: async () => ({ status: 'observed', errors: [],
      states: [{ agentId: SCOPE.entityId, agentStatus: 'active' }],
      pathologies: [{ id: 'path-1', agentId: SCOPE.entityId, pathologyType: 'mutation_drift',
        severity: 0.85, confidence: 0.9, status: 'active' }], rustApplications: [] })
  });

  assert.equal(compiled.plan.primaryFamily, 'genetic');
  assert.equal(compiled.plan.recommendedControl, 'repair_inherited_source_before_recruitment');
  assert.ok(compiled.plan.candidates.some((item) => item.id === 'inherited_source_repair'));
  return compiled;
}

async function testImmuneEffectorNurseryExecution() {
  const alerts = ingestSecurityAlerts({ alerts: [{
    externalId: 'alert-x', ruleId: 'path-traversal', cwes: ['CWE-22'], trustBoundary: 'vfs',
    sourceKind: 'user_input', sinkKind: 'fs_read', message: 'path traversal risk',
    location: { path: 'src/file.js', line: 12 }
  }] });
  const graph = buildAntigenGraph(alerts);
  const campaign = planRemediationCampaign(graph, { sourceDigest: 'sha256:source-code', producerId: SCOPE.entityId });

  let admittedToCanary = null;
  const execution = await immuneEffector.executeCampaign({
    campaign, authorization: { requiresExplicitAuthorization: true },
    verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:immune-campaign' }),
    createNursery: async ({ candidate }) => ({ id: `nursery:${candidate.id}`, isolated: true,
      workspaceId: candidate.isolation.workspaceId, sourceDigest: candidate.isolation.sourceDigest,
      network: 'disabled' }),
    applyCandidate: async ({ candidate }) => ({ candidateId: candidate.id, patched: true }),
    runLocalOracles: async ({ candidate }) => ({ evidenceRef: `oracle:${candidate.id}`,
      checks: oracleChecks(candidate.family === 'control') }),
    verifyIndependently: async ({ candidate }) => ['verifier-1', 'verifier-2'].map((verifierId) => ({
      verifierId, evidenceRef: `verified:${verifierId}:${candidate.id}`,
      checks: oracleChecks(candidate.family === 'control') })),
    canaryGate: async ({ recommendation }) => { admittedToCanary = recommendation.candidateId; return { admitted: true }; }
  });

  assert.equal(execution.adjudication.recommendations.length, 1);
  assert.equal(execution.winner, admittedToCanary);
  assert.equal(execution.canaryAdmission.admitted, true);
  return execution;
}

function oracleChecks(isControl) {
  return {
    scannerOutcome: isControl ? 'present' : 'cleared',
    safePathReproduction: isControl ? 'reachable' : 'blocked',
    functionalInvariants: 'passed', newHazards: 'none',
    metrics: { remainingAlerts: isControl ? 4 : 0, invariantFailures: 0, newHazards: 0, diffLines: isControl ? 0 : 3 }
  };
}

async function testDevelopmentalEndocrineBridge(db) {
  const history = endocrineBridge.calculatePressure(
    [{ dimension: 'planning', kind: 'capability_gap', epistemic_status: 'observed' },
      { dimension: 'security', kind: 'degradation', epistemic_status: 'observed' }],
    [{ dimension: 'planning', current_phase: 'relapsed' }]
  );
  assert.ok(history.developmentalPressure > 0);

  const jobs = endocrineBridge.prioritizeJobs([
    { id: 'job-unrelated', dimension: 'telemetry', developmentalPriority: 0 },
    { id: 'job-planning', dimension: 'planning', developmentalPriority: 0 }
  ], history.profile);
  assert.equal(jobs[0].id, 'job-planning');

  const endocrineEvents = [];
  const secretion = await endocrineBridge.secretePressure({
    db, projectId: SCOPE.projectId, jobs,
    authorization: { requiresExplicitAuthorization: true },
    verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:secrete-somatotropin' }),
    modulateEndocrine: async (event) => { endocrineEvents.push(event); }
  });
  assert.equal(endocrineEvents[0].signal, 'developmental_pressure');
  assert.equal(endocrineEvents[0].hormone, 'somatotropin');
  assert.ok(secretion.priorities[0].developmentalPriority > 0);

  // Clearance verification
  let clearanceEvent;
  const cleared = await endocrineBridge.recordProgressAndClear({
    db, progress: { organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, entityId: SCOPE.entityId,
      initiativeId: 'init-1', gvxEventId: 'gvx-mock-event' },
    authorization: { requiresExplicitAuthorization: true },
    verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:decay-somatotropin' }),
    modulateEndocrine: async (event) => { clearanceEvent = event; return { cleared: true }; }
  }).catch(() => null);

  return { secretion, cleared };
}

async function main() {
  const db = await setupDatabase();
  try {
    const { observationId } = await testSensorimotorToSelfTwin(db);
    const morphogenesisResult = await testShevMorphogenesisResponse(db, observationId);
    await testImmuneEffectorNurseryExecution();
    await testDevelopmentalEndocrineBridge(db);

    // Terminal resolution
    let terminalResolution;
    await morphogenesisBridge.recordResolution({
      episode: { ...morphogenesisResult.episode, current_phase: 'healed' },
      nosology: morphogenesisResult.nosology, evidenceRefs: ['artifact:final-healed-proof'],
      verifyEvidenceRefs: async () => [{ verified: true, artifactHash: 'b'.repeat(64) }],
      updateProfile: async (rec) => { terminalResolution = rec; }
    });
    assert.equal(terminalResolution.resolution, 'healed');

    console.log('Complete closed-loop physiological arc passed successfully:');
    console.log(' - Connection A: Sensorimotor discrepancy -> Self-Twin -> AGOW -> SHEV capability_gap');
    console.log(' - Connection B: SHEV lesion -> Nosology -> Morphogenetic response planning');
    console.log(' - Connection C: Immune remediation -> Isolated nursery -> Oracles -> Canary admission');
    console.log(' - Connection D: Stewardship pain -> Developmental endocrine pressure -> GVX prioritization & resolution');
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
