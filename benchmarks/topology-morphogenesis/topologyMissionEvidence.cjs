'use strict';

function parseWorkerReport(raw) {
  try {
    const payload = JSON.parse(raw || '{}');
    return payload.evidenceReport || payload.report || payload;
  } catch (_) { return null; }
}

async function workerStates(db, receipt) {
  if (!receipt?.orchestratorId) return [];
  const rows = await db.all(`SELECT a.id, a.status, a.role,
    (SELECT payload_json FROM telemetry_events e WHERE e.agent_id = a.id
     AND e.event_type = 'EVIDENCE_REPORT' ORDER BY e.id DESC LIMIT 1) AS report_json
    FROM agents a WHERE a.parent_agent_id = ? AND a.execution_mode = 'worker' ORDER BY a.id`, receipt.orchestratorId);
  return rows.map((row) => ({ id: row.id, role: row.role, status: row.status,
    evidenceReport: parseWorkerReport(row.report_json) }));
}

function isSubstantiveClaim(claim) {
  return typeof claim?.statement === 'string' && claim.statement.trim().length > 20;
}

function hasSubstantiveClaims(report) {
  const claims = Array.isArray(report.claims) ? report.claims : [];
  return claims.some((claim) => isSubstantiveClaim(claim));
}

function hasArtifactText(report) {
  return typeof report.artifactText === 'string' && report.artifactText.trim().length > 40;
}

function hasTestEvidence(report) {
  return Array.isArray(report.tests) && report.tests.length > 0;
}

function hasEmbeddedContent(report) {
  const content = report.workerArtifact?.content || report.artifact?.content;
  return typeof content === 'string' && content.trim().length > 40;
}

function hasSubstantiveReport(report) {
  if (!report || typeof report !== 'object') return false;
  if (hasSubstantiveClaims(report)) return true;
  if (hasArtifactText(report)) return true;
  if (hasTestEvidence(report)) return true;
  return hasEmbeddedContent(report);
}

function assessTopologyMission(input) {
  const workers = Array.isArray(input.workers) ? input.workers : [];
  const reports = workers.filter((worker) => hasSubstantiveReport(worker.evidenceReport));
  const failures = [];
  if (!workers.length) failures.push('no persisted topology workers');
  if (reports.length !== workers.length) failures.push(`worker dossiers incomplete (${reports.length}/${workers.length})`);
  if (input.oracle?.status !== 'independent' || input.oracle?.passed !== true) {
    failures.push('independent mission oracle missing or not passed');
  }
  return { passed: failures.length === 0, failures, workerCount: workers.length,
    substantiveReportCount: reports.length, oracleStatus: input.oracle?.status || 'missing' };
}

module.exports = { workerStates, parseWorkerReport, hasSubstantiveReport, assessTopologyMission };
