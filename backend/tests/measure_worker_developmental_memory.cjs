'use strict';

// Read persisted outcomes of real worker missions, then probe a fresh plan.
const { getDatabase, closeDatabase } = require('../src/db');
const { recallBeforePlanning } = require('../src/services/autobiographicalMemory/orchestratorRecall');
const { validateWorkerArtifact } = require('../src/services/agents/workerArtifactContract');

function parsed(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

async function latestEvent(db, agentId, eventType) {
  return db.get('SELECT event_type, detail, payload_json FROM telemetry_events WHERE agent_id = ? AND event_type = ? ORDER BY id DESC LIMIT 1', agentId, eventType);
}

function verifiedArtifact(event, agent) {
  const payload = parsed(event?.payload_json);
  const report = payload.evidenceReport;
  if (!report) return { valid: false, type: null, outcome: null, sourceRefs: [] };
  try {
    validateWorkerArtifact({ events: [{ evidenceReport: report }] }, agent);
    return { valid: true, type: report.workerArtifact.type, outcome: report.outcome,
      sourceRefs: report.workerArtifact.provenance.sourceRefs };
  } catch (error) {
    return { valid: false, type: report.workerArtifact?.type || null, outcome: report.outcome,
      sourceRefs: [], validationError: error.code || error.message };
  }
}

async function measure(db, row) {
  const metadata = parsed(row.metadata_json);
  const agent = { agentId: row.id, workerContract: metadata.workerContract };
  const evidence = await latestEvent(db, row.id, 'EVIDENCE_REPORT');
  const completed = await latestEvent(db, row.id, 'AGENT_COMPLETED');
  const failed = await latestEvent(db, row.id, 'AGENT_FAILED');
  const episodes = await db.get('SELECT COUNT(*) AS n FROM autobiographical_episodes WHERE agent_id = ?', row.id);
  const scope = await db.get(`SELECT w.organization_id AS organizationId, w.project_id AS projectId
    FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id WHERE a.id = ?`, row.id);
  const plan = { selfModel: { decisionPolicy: { riskTolerance: 0.5, evidenceStrictness: 0.5 },
    limits: {}, state: { confidence: 0.5 } } };
  const recall = await recallBeforePlanning({ db, agentId: row.id,
    normalizedMission: { prompt: 'Analyze the assigned synthetic fixture again.', kind: 'mission_end',
      organizationId: scope?.organizationId || undefined, projectId: scope?.projectId || undefined },
    autonomyPlan: plan });
  return { kind: metadata.workerKind, workerId: row.id, status: row.status,
    artifact: verifiedArtifact(evidence, agent), nativeCompletedEvent: Boolean(completed),
    finalFailure: failed?.detail || null, episodesPersisted: episodes.n,
    lessonsRecalled: recall.lessons.length, policyAfterRestart: plan.selfModel.decisionPolicy };
}

async function main() {
  const [dbPath, runId] = process.argv.slice(2);
  if (!dbPath || !runId) throw new Error('Usage: node measure_worker_developmental_memory.cjs <db> <runId>');
  const db = await getDatabase(dbPath);
  try {
    const rows = await db.all(`SELECT id,status,metadata_json FROM agents
      WHERE id LIKE ? AND execution_mode = 'worker' ORDER BY id`, `worker_compliance-parent-${runId}-%`);
    const results = [];
    for (const row of rows) results.push(await measure(db, row));
    process.stdout.write(`${JSON.stringify({ runId, count: results.length, results }, null, 2)}\n`);
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
