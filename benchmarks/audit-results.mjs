#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(benchmarkRoot);
const resultsRoot = path.resolve(repositoryRoot, readOption('--results-dir') || 'benchmarks/results');
const outputPath = path.resolve(repositoryRoot, readOption('--output') || path.join(resultsRoot, 'evidence-audit-report.json'));
const requested = (readOption('--tasks') || 'B01,B02,B03,B04,B05,B09,B06,B07,B10,B08')
  .split(',')
  .map((task) => task.trim().toUpperCase())
  .filter(Boolean);

const taskDefinitions = {
  B01: { benchmarkId: 'genos.replay', file: 'replay-fidelity-report.json', audit: auditReplay },
  B02: { benchmarkId: 'genos.isolation', file: 'isolation-boundary-report.json', audit: auditIsolation },
  B03: { benchmarkId: 'genos.resilience', file: 'fault-recovery-report.json', audit: auditResilience },
  B04: { benchmarkId: 'genos.performance', file: 'performance-distribution.json', audit: auditPerformance },
  B05: { benchmarkId: 'genos.mcp-safety', file: 'mcp-safety-report.json', audit: auditMcpSafety },
  B06: { benchmarkId: 'public.swe', file: 'swe-public-report.json', audit: auditBlockedPublic },
  B07: { benchmarkId: 'public.tool-use', file: 'tool-use-public-report.json', audit: auditBlockedPublic },
  B08: { benchmarkId: 'public.web', file: 'web-public-report.json', audit: auditBlockedPublic },
  B09: { benchmarkId: 'public.safety', file: 'safety-public-report.json', audit: auditBlockedPublic },
  B10: { benchmarkId: 'comparative.observability', file: 'observability-comparison.json', audit: auditObservability },
};

const unknown = requested.filter((taskId) => !taskDefinitions[taskId]);
if (unknown.length) fail(`unsupported task(s): ${unknown.join(', ')}`);

const generatedAt = new Date().toISOString();
const audits = requested.map((taskId) => auditTask(taskId, taskDefinitions[taskId]));
const failed = audits.some((audit) => audit.decision === 'rejected');
const auditReport = {
  schema_version: 'genos-evidence-audit-v1',
  generated_at: generatedAt,
  auditor_role: 'benchmark_evidence_auditor',
  requested_tasks: requested,
  repository_revision: repositoryRevision(),
  overall_decision: failed ? 'rejected' : 'approved_scoped_claims_only',
  claim_policy: {
    internal_claims: 'Only the explicitly verified metrics and stated limitations are approved.',
    public_claims: 'Withheld until dataset, runtime, comparison-condition, and human-approval gates pass.',
    comparative_claims: 'Withheld until version-pinned external adapters execute under matched conditions.',
  },
  tasks: audits,
};

writeJsonAtomic(outputPath, auditReport);
process.stdout.write(`${JSON.stringify({ output: path.relative(repositoryRoot, outputPath), overall_decision: auditReport.overall_decision, tasks: audits.map(({ task_id, decision }) => ({ task_id, decision })) }, null, 2)}\n`);
if (failed) process.exitCode = 1;

function auditTask(taskId, definition) {
  const reportPath = path.join(resultsRoot, definition.file);
  const errors = [];
  const checks = [];
  let report;
  try {
    report = readJson(reportPath);
  } catch (error) {
    return rejected(taskId, definition, reportPath, [`cannot read report: ${error.message}`], []);
  }

  check(errors, checks, report.task_id === taskId, 'task identity matches');
  check(errors, checks, report.benchmark_id === definition.benchmarkId, 'benchmark identity matches');
  check(errors, checks, report.deliverable === definition.file, 'deliverable name matches');
  verifySourceEvidence(report, errors, checks);
  verifyCommandEvidence(report, errors, checks);
  definition.audit({ taskId, report, errors, checks });

  const publicBlocked = ['B06', 'B07', 'B08', 'B09'].includes(taskId);
  const decision = errors.length
    ? 'rejected'
    : publicBlocked
      ? 'withheld_external_dependencies'
      : 'approved_with_limitations';
  return {
    task_id: taskId,
    benchmark_id: definition.benchmarkId,
    deliverable: definition.file,
    report_sha256: sha256(fs.readFileSync(reportPath)),
    report_path: path.relative(repositoryRoot, reportPath),
    decision,
    scoped_claim_allowed: !publicBlocked && taskId !== 'B10' && errors.length === 0,
    checks,
    errors,
    limitations: report.limitations || [],
    reviewed_at: generatedAt,
  };
}

export function auditIsolation({ report, errors, checks }) {
  check(errors, checks, report.local_execution?.status === 'passed' || report.audit?.decision === 'approved_with_limitations', 'local isolation execution passed');
  requireMetric(report, 'process_isolation', 'unsupported', null, errors, checks);
  requireMetric(report, 'network_policy', 'unsupported', null, errors, checks);
  const environment = findMetric(report, 'environment_inheritance') || findMetric(report, 'environment_isolation');
  check(errors, checks, Boolean(environment), 'environment boundary is explicitly reported');
  check(errors, checks, report.limitations?.some((item) => /not (?:a )?(?:Copy-on-Write|OS sandbox)|not Copy-on-Write/i.test(item)), 'copy/sandbox limitation is declared');
}

export function auditReplay({ report, errors, checks }) {
  const fidelity = report.fidelity || {};
  check(errors, checks, report.status === 'passed', 'replay benchmark passed');
  check(errors, checks, report.iterations === 500, '500 replay iterations were measured');
  check(errors, checks, report.durations_ns?.count === report.iterations, 'raw replay sample count matches iterations');
  for (const name of ['replay_fingerprint_match_rate', 'event_hash_match_rate', 'final_state_hash_match_rate']) {
    check(errors, checks, fidelity[name] === 1, `${name} is 1`);
  }
  check(errors, checks, report.causal_probe?.event_hash_change_detected === true, 'causal event mutation was detected');
  check(errors, checks, report.causal_probe?.final_state_hash_change_detected === true, 'causal state mutation was detected');
  check(errors, checks, report.limitations?.some((item) => /reducer replay only/i.test(item)), 'replay scope limitation is declared');
}

export function auditPerformance({ report, errors, checks }) {
  const replay = report.measurements?.replay;
  const world = report.measurements?.world_fork;
  check(errors, checks, report.status === 'completed', 'performance benchmark completed');
  check(errors, checks, report.validation?.raw_distributions_included === true, 'raw distributions are included');
  check(errors, checks, report.validation?.statistics_recomputed === true, 'statistics were recomputed');
  check(errors, checks, replay?.durations_ns?.samples?.length === 500, '500 replay samples are present');
  check(errors, checks, world?.fork_latency_ns?.samples?.length === 500, '500 fork samples are present');
  check(errors, checks, report.validation?.same_platform === true, 'measurements used the same platform');
  check(errors, checks, report.limitations?.some((item) => /not a Copy-on-Write/i.test(item)), 'fork scope limitation is declared');
}

export function auditResilience({ report, errors, checks }) {
  const commands = report.evidence?.commands || [];
  check(errors, checks, commands.length >= 3, 'rollback, revert, and recovery evidence commands are present');
  const rawPath = path.join(resultsRoot, 'resilience-specialist', 'fault-recovery-report.json');
  let raw;
  try {
    raw = readJson(rawPath);
  } catch (error) {
    errors.push(`cannot read raw resilience evidence: ${error.message}`);
    return;
  }
  check(errors, checks, raw.iterations === 500, 'raw recovery evidence contains 500 measured iterations');
  for (const [name, value] of Object.entries(raw.recovery || {})) {
    check(errors, checks, value === 1 || value === raw.iterations, `raw recovery predicate ${name} passed`);
  }
  check(errors, checks, raw.injection_results?.every((result) => result.passed), 'all threshold injection predicates passed');
  checks.push({
    name: 'raw resilience report hash recorded',
    passed: true,
    evidence: {
      path: path.relative(repositoryRoot, rawPath),
      sha256: sha256(fs.readFileSync(rawPath)),
    },
  });
  check(errors, checks, report.limitations?.some((item) => /not distributed|in-process|external side-effect/i.test(item)), 'recovery scope limitation is declared');
}

export function auditMcpSafety({ report, errors, checks }) {
  check(errors, checks, report.local_execution?.status === 'passed', 'local MCP safety execution passed');
  check(errors, checks, report.local_execution?.predicates?.failed === 0, 'all deterministic MCP predicates passed');
  check(errors, checks, report.local_execution?.command_suites?.failed === 0, 'all required MCP command suites passed');
  requireMetric(report, 'direct_mcp_identity_and_approval_integration', 'unsupported', null, errors, checks);
  check(errors, checks, report.claim_allowed === false, 'unreviewed production claim is withheld');
  check(errors, checks, report.limitations?.some((item) => /end-to-end caller identity|distinct layers/i.test(item)), 'MCP integration limitation is declared');
}

export function auditBlockedPublic({ report, errors, checks }) {
  check(errors, checks, report.public_benchmark === true, 'report is marked public');
  check(errors, checks, /blocked_external/.test(report.execution_status), 'execution is explicitly blocked');
  check(errors, checks, report.claim_allowed === false, 'public claim is withheld');
  check(errors, checks, report.score === null, 'score is null');
  check(errors, checks, report.sample_size === 0, 'sample size is zero');
  check(errors, checks, (report.evidence?.commands || []).length === 0, 'no external execution is represented');
  const gates = report.gates || [];
  check(errors, checks, gates.length >= 4 && gates.every((gate) => gate.status === 'missing'), 'all required external gates are recorded as missing');
  check(errors, checks, report.audit?.decision === 'withheld', 'specialist audit decision is withheld');
}

export function auditObservability({ report, errors, checks }) {
  const comparisonBlocked = report.claim_allowed === false
    || report.comparison_eligible === false
    || /inconclusive|external_adapters_missing/.test(`${report.comparison_status || ''} ${report.status || ''}`);
  check(errors, checks, comparisonBlocked, 'cross-system comparison is not claimable');
  const systems = report.systems || [];
  const external = systems.filter((system) => !['GenOS', 'genos'].includes(system.name || system.system_id));
  check(errors, checks, external.length > 0, 'external comparison systems are enumerated');
  check(errors, checks, external.every((system) => ['not_run', 'unsupported'].includes(system.execution_status || system.adapter_status)), 'every external adapter is not_run or unsupported');
  check(errors, checks, external.every((system) => system.score === null || system.score === undefined), 'no external score is fabricated');
  const otel = findMetric(report, 'opentelemetry_export');
  if (otel) check(errors, checks, otel.status === 'unsupported' && otel.value === null, 'OpenTelemetry export is not overclaimed');
  check(errors, checks, report.limitations?.some((item) => /No .*adapter|external adapter/i.test(item)) || report.comparison_blocker, 'missing-adapter limitation is declared');
}

function verifySourceEvidence(report, errors, checks) {
  for (const source of report.evidence?.sources || []) {
    if (typeof source === 'string') {
      check(errors, checks, fs.existsSync(path.join(repositoryRoot, source)), `source exists: ${source}`);
      continue;
    }
    const sourcePath = path.join(repositoryRoot, source.path);
    const exists = fs.existsSync(sourcePath);
    check(errors, checks, exists, `source exists: ${source.path}`);
    if (exists && source.sha256) {
      check(errors, checks, sha256(fs.readFileSync(sourcePath)) === source.sha256, `source hash matches: ${source.path}`);
    }
  }
}

function verifyCommandEvidence(report, errors, checks) {
  const commands = [
    ...(report.evidence?.commands || []),
    ...(report.runtime_evidence?.commands || []),
  ];
  for (const command of commands) {
    check(errors, checks, command.passed === true || command.status === 'passed', `command passed: ${command.id || 'unnamed'}`);
    check(errors, checks, command.exit_code === 0, `command exit code is zero: ${command.id || 'unnamed'}`);
    if (command.evidence_file && command.output_sha256) {
      const evidencePath = path.join(repositoryRoot, command.evidence_file);
      const exists = fs.existsSync(evidencePath);
      check(errors, checks, exists, `command evidence log exists: ${command.id}`);
      if (exists) check(errors, checks, sha256(fs.readFileSync(evidencePath)) === command.output_sha256, `command evidence hash matches: ${command.id}`);
    }
  }
}

function requireMetric(...input) {
  const [report, name, status, value, errors, checks] = input;
  const metric = findMetric(report, name);
  check(errors, checks, Boolean(metric), `metric is present: ${name}`);
  if (!metric) return;
  check(errors, checks, metric.status === status, `${name} status is ${status}`);
  check(errors, checks, metric.value === value, `${name} value is ${JSON.stringify(value)}`);
}

function findMetric(report, name) {
  return (report.metrics || []).find((metric) => metric.name === name);
}

function check(...input) {
  const [errors, checks, condition, name] = input;
  const passed = Boolean(condition);
  checks.push({ name, passed });
  if (!passed) errors.push(name);
}

function rejected(...input) {
  const [taskId, definition, reportPath, errors, checks] = input;
  return {
    task_id: taskId,
    benchmark_id: definition.benchmarkId,
    deliverable: definition.file,
    report_path: path.relative(repositoryRoot, reportPath),
    report_sha256: null,
    decision: 'rejected',
    scoped_claim_allowed: false,
    checks,
    errors,
    limitations: [],
    reviewed_at: generatedAt,
  };
}

function repositoryRevision() {
  const head = path.join(repositoryRoot, '.git', 'HEAD');
  if (!fs.existsSync(head)) return 'unknown';
  const value = fs.readFileSync(head, 'utf8').trim();
  if (!value.startsWith('ref: ')) return value;
  const reference = path.join(repositoryRoot, '.git', value.slice(5));
  return fs.existsSync(reference) ? fs.readFileSync(reference, 'utf8').trim() : 'unknown';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) fail(`${name} requires a value`);
  return value;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}
