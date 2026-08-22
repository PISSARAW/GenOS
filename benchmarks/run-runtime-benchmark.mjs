#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  commandRecord,
  parseJsonOutput,
  repositoryMetadata,
  runEvidenceCommand,
  sourceEvidence,
} from './lib/evidence.mjs';
import { assertValidReport } from './lib/report-policy.mjs';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(benchmarkRoot);
const outputDir = path.resolve(repositoryRoot, option('--output-dir') || 'benchmarks/results');
const iterations = positiveInteger(option('--iterations') || '500', '--iterations');
const evidenceDir = path.join(outputDir, 'evidence', 'B03');
const metadata = repositoryMetadata(repositoryRoot);

fs.mkdirSync(outputDir, { recursive: true });
const commands = [
  execute('resilience-control-probe', 'node', ['benchmarks/probes/resilience-probe.cjs', '--iterations', String(iterations)]),
  execute('causal-rollback-test', 'cargo', ['test', '-q', '-p', 'genos-core', 'causality::tests::test_causal_boundary_lifecycle']),
  execute('safest-revert-test', 'cargo', ['test', '-q', '-p', 'genos-core', 'revert::tests::test_find_last_known_good_state_and_cherry_pick']),
  execute('model-fallback-tests', 'cargo', ['test', '-q', '-p', 'genos-model', 'adapters::']),
];
const passed = commands.every((command) => command.passed);
const measurement = commands[0].passed ? parseJsonOutput(commands[0]) : null;
const report = createReport(passed, measurement);
assertValidReport(report);
fs.writeFileSync(path.join(outputDir, report.deliverable), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ task_id: 'B03', passed, deliverable: report.deliverable }, null, 2)}\n`);
if (!passed) process.exitCode = 1;

function execute(id, command, args) {
  const result = runEvidenceCommand({ id, command, args, cwd: repositoryRoot, evidenceDir });
  process.stderr.write(`[benchmarks] B03 ${id}: ${result.passed ? 'PASS' : 'FAIL'}\n`);
  return result;
}

function createReport(passed, measurement) {
  return {
    schema_version: 'genos-benchmark-report-v1',
    task_id: 'B03',
    benchmark_id: 'genos.resilience',
    deliverable: 'fault-recovery-report.json',
    generated_at: new Date().toISOString(),
    repository: metadata,
    execution_status: passed ? 'completed' : 'failed',
    evidence: {
      commands: commands.map((command) => commandRecord(command, repositoryRoot)),
      sources: [
        sourceEvidence(repositoryRoot, 'backend/src/services/circuitBreaker.js'),
        sourceEvidence(repositoryRoot, 'crates/genos-core/src/causality.rs'),
        sourceEvidence(repositoryRoot, 'crates/genos-core/src/revert.rs'),
        sourceEvidence(repositoryRoot, 'crates/genos-model/src/adapters/fallback.rs'),
      ],
    },
    metrics: [
      { name: 'fault_control_predicates', status: measurement ? 'verified' : 'failed', value: measurement?.predicates || null },
      { name: 'control_cycle_latency_ns', status: measurement ? 'measured' : 'not_measured', value: measurement?.control_cycle_latency_ns || null },
      { name: 'fault_injections', status: measurement ? 'measured' : 'not_measured', value: measurement ? measurement.iterations * measurement.injected_failures_per_iteration : null },
      { name: 'causal_rollback', status: commands[1].passed ? 'verified' : 'failed', value: commands[1].passed },
      { name: 'dependency_aware_revert', status: commands[2].passed ? 'verified' : 'failed', value: commands[2].passed },
      { name: 'model_fallback', status: commands[3].passed ? 'verified' : 'failed', value: commands[3].passed },
    ],
    limitations: [
      'The latency measurement covers in-process control transitions, not distributed recovery MTTR.',
      'The probe injects deterministic tool failures; it does not kill an operating-system process.',
      'Rollback tests validate logical AgentState restoration, not arbitrary external side-effect reversal.',
    ],
    audit: {
      agent_role: 'benchmark_evidence_auditor',
      decision: passed ? 'approved_with_limitations' : 'rejected',
      rationale: passed
        ? 'Fault controls, recovery, rollback, revert, and fallback predicates passed.'
        : 'At least one required fault-recovery evidence command failed.',
    },
  };
}

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a value`);
  return value;
}
