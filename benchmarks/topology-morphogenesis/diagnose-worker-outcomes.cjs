'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CAUSE_PATTERNS = [
  ['storage_exhausted', /SQLITE_FULL|no space left on device/i],
  ['sqlite_contention', /SQLITE_BUSY|database is locked/i],
  ['token_budget_exhausted', /exceeded token budget|prompt consumes.*token budget/i],
  ['runtime_timeout', /timed out|timeout|ETIMEDOUT/i]
];

function parseWorkerRecord(content) {
  let record = null;
  for (const line of content.split(/\r?\n/)) {
    try {
      const candidate = JSON.parse(line);
      if (candidate?.workerId && Array.isArray(candidate.agents)) record = candidate;
    } catch (_) { /* non-JSON runtime diagnostic */ }
  }
  return record;
}

function classifyWorker(status, diagnosticLines) {
  const causes = new Set();
  for (const line of diagnosticLines) {
    for (const [cause, pattern] of CAUSE_PATTERNS) {
      if (pattern.test(line)) causes.add(cause);
    }
  }
  if (causes.size) return [...causes];
  if (status === 'blocked') return ['blocked_without_runtime_reason'];
  if (status === 'error') return ['runtime_error_unclassified'];
  if (status && status !== 'completed') return [`worker_${status}`];
  return [];
}

function diagnosticLines(content) {
  return content.split(/\r?\n/).filter((line) =>
    CAUSE_PATTERNS.some(([, pattern]) => pattern.test(line)));
}

function workerStatus(record) {
  return record.agents.find((agent) => agent.id === record.workerId)?.status || 'unknown';
}

function missionIndex(results) {
  return new Map(results.missions.filter((mission) => mission.orchestratorId)
    .map((mission) => [mission.orchestratorId, mission.name]));
}

function missingWorkerDiagnostics(results, observedIds) {
  const missing = [];
  for (const mission of results.missions) {
    for (const worker of mission.workers || []) {
      if (observedIds.has(worker.id)) continue;
      missing.push({ mission: mission.name, workerId: worker.id, status: worker.status,
        causes: ['worker_log_missing'], diagnosticCount: 0 });
    }
  }
  return missing;
}

function diagnoseLog(filePath, orchestrators) {
  const content = fs.readFileSync(filePath, 'utf8');
  const record = parseWorkerRecord(content);
  if (!record) return null;
  const lines = diagnosticLines(content);
  const status = workerStatus(record);
  return {
    mission: orchestrators.get(record.orchestratorId) || null,
    orchestratorId: record.orchestratorId,
    workerId: record.workerId,
    workerName: record.workerName,
    status,
    causes: classifyWorker(status, lines),
    diagnosticCount: lines.length
  };
}

function buildReport(runDirectory) {
  const results = JSON.parse(fs.readFileSync(path.join(runDirectory, 'campaign-results.json'), 'utf8'));
  const logDirectory = path.join(runDirectory, 'runner-logs');
  const orchestrators = missionIndex(results);
  const workers = fs.readdirSync(logDirectory).filter((name) => name.endsWith('.log'))
    .map((name) => diagnoseLog(path.join(logDirectory, name), orchestrators)).filter(Boolean);
  const observedIds = new Set(workers.map((worker) => worker.workerId));
  workers.push(...missingWorkerDiagnostics(results, observedIds));
  return { runId: results.runId, gitCommit: results.gitCommit, workers };
}

function main(runDirectory) {
  const root = path.resolve(runDirectory || '');
  const report = buildReport(root);
  const target = path.join(root, 'worker-diagnostics.json');
  fs.writeFileSync(target, JSON.stringify(report, null, 2));
  const failures = report.workers.filter((worker) => worker.causes.length);
  process.stdout.write(`worker-diagnostics: ${failures.length}/${report.workers.length} workers have classified or incomplete outcomes\n${target}\n`);
  return target;
}

if (require.main === module) main(process.argv[2]);

module.exports = { buildReport, classifyWorker, diagnosticLines, missingWorkerDiagnostics, parseWorkerRecord };
