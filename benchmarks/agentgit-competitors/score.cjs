'use strict';

const METRICS = ['integrity', 'branchIsolation', 'epistemicConflict', 'permissionSafety', 'replay'];
const RESULTS = new Set(['pass', 'fail', 'unsupported', 'not_run']);

function validateRun(run) {
  const issues = [];
  if (run?.schema !== 'genos.agentgit-benchmark/v1') issues.push('unsupported_schema');
  if (!run?.system || !run?.version || !run?.adapter || !Array.isArray(run?.tasks)) issues.push('missing_run_identity');
  const seen = new Set();
  for (const task of run?.tasks || []) validateTask({ task, issues, seen });
  return { valid: issues.length === 0, issues };
}

function validateTask(ctx) {
  const { task, issues, seen } = ctx;
  if (!task?.id || seen.has(task.id)) issues.push('invalid_or_duplicate_task_id');
  seen.add(task?.id);
  for (const [metric, result] of Object.entries(task?.metrics || {})) {
    if (!METRICS.includes(metric) || !RESULTS.has(result?.result)) issues.push(`invalid_metric:${metric}`);
    if (['pass', 'fail'].includes(result?.result) &&
        (!result.evidence?.path || !/^[a-f0-9]{64}$/.test(result.evidence?.sha256 || ''))) {
      issues.push(`missing_evidence:${task.id}:${metric}`);
    }
  }
}

function compareRuns(runs) {
  const invalid = runs.map((run) => ({ run, validation: validateRun(run) })).filter((entry) => !entry.validation.valid);
  if (invalid.length) return { success: false, error: 'Benchmark run validation failed.', invalid: invalid.map(({ run, validation }) => ({ system: run?.system || null, issues: validation.issues })) };
  const taskIds = commonTaskIds(runs);
  return {
    success: true,
    schema: 'genos.agentgit-benchmark-report/v1',
    comparableTaskIds: taskIds,
    systems: runs.map((run) => summarizeRun(run, taskIds)),
    ranking: null,
    rankingReason: 'Scores are descriptive; this harness does not select a winner.'
  };
}

function commonTaskIds(runs) {
  if (!runs.length) return [];
  const rest = runs.slice(1).map((run) => new Set(run.tasks.map((task) => task.id)));
  return runs[0].tasks.map((task) => task.id).filter((id) => rest.every((ids) => ids.has(id)));
}

function summarizeRun(run, taskIds) {
  const tasks = new Map(run.tasks.map((task) => [task.id, task]));
  const metrics = Object.fromEntries(METRICS.map((metric) => [metric, metricSummary(tasks, taskIds, metric)]));
  return { system: run.system, version: run.version, adapter: run.adapter, metrics };
}

function metricSummary(tasks, taskIds, metric) {
  const observed = taskIds.map((id) => tasks.get(id)?.metrics?.[metric]?.result || 'not_run');
  return {
    pass: observed.filter((result) => result === 'pass').length,
    fail: observed.filter((result) => result === 'fail').length,
    unsupported: observed.filter((result) => result === 'unsupported').length,
    notRun: observed.filter((result) => result === 'not_run').length,
    denominator: observed.length
  };
}

function runCli() {
  const path = process.argv[2];
  if (!path) {
    process.stderr.write('Usage: node score.cjs <benchmark-runs.json>\n');
    process.exitCode = 2;
    return;
  }
  const runs = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  const report = compareRuns(runs);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.success) process.exitCode = 1;
}

if (require.main === module) runCli();
module.exports = { METRICS, validateRun, compareRuns };
