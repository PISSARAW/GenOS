#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  approvalState,
  blockedStatus,
  componentPreflight,
  executeComponent,
  loadApproval,
} from './lib/public-runner-support.mjs';

const benchmarkRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.dirname(benchmarkRoot);
const defaultTaskIds = ['B06', 'B07', 'B08'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function repositoryRevision() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : null;
}

function parseArguments(argv) {
  const options = {
    taskIds: defaultTaskIds,
    execute: false,
    approvalFile: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') {
      options.execute = true;
    } else if (argument === '--tasks') {
      const value = argv[index += 1];
      if (!value) throw new Error('--tasks requires a comma-separated value');
      options.taskIds = value.split(',').map((item) => item.trim()).filter(Boolean);
    } else if (argument === '--approval') {
      options.approvalFile = argv[index += 1];
      if (!options.approvalFile) throw new Error('--approval requires a JSON file');
    } else if (argument === '--output-dir') {
      options.outputDir = argv[index += 1];
      if (!options.outputDir) throw new Error('--output-dir requires a directory');
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error('Unknown argument: ' + argument);
    }
  }

  if (options.taskIds.length === 0) throw new Error('At least one task is required');
  return options;
}

function usage() {
  return [
    'Usage: node benchmarks/public-runner.mjs [options]',
    '',
    'Options:',
    '  --tasks B06,B07,B08  Public benchmark tasks to prepare (default: B06,B07,B08)',
    '  --output-dir DIR      Deliverable directory (default: a timestamped workspace run)',
    '  --approval FILE       Human approval manifest for external execution',
    '  --execute             Execute configured component commands after a clean preflight',
    '  --help                Show this help',
    '',
    'Commands are JSON argv arrays stored in the environment variables named by',
    'benchmarks/public-suites.json. Each command must write its result JSON to',
    'GENOS_BENCHMARK_RESULT_FILE.',
  ].join('\n');
}

function createReport({ task, suite, approvals, components, status, generatedAt, revision, gatePolicy }) {
  const executed = components.filter((component) => component.status === 'executed_pending_audit');
  const decision = status === 'execution_failed' ? 'rejected' : 'withheld';
  const gates = [
    {
      name: 'dataset_identity_and_checksum',
      status: approvals.dataset_approved && components.every((component) => (
        component.dataset.configured && component.dataset.available && component.dataset.checksum_valid
          && component.dataset.approval_match
      )) ? 'satisfied' : 'missing',
    },
    {
      name: 'runtime_and_model_identity',
      status: approvals.runtime_approved && components.every((component) => (
        component.runtime.configured && component.runtime.approval_match
      ))
        ? 'satisfied' : 'missing',
    },
    {
      name: 'comparison_conditions',
      status: approvals.comparison_approved && approvals.comparison_conditions_sha256 ? 'satisfied' : 'missing',
    },
    {
      name: 'human_approval_receipt',
      status: approvals.approval_id && approvals.approved_by && approvals.approved_at ? 'satisfied' : 'missing',
    },
  ];
  const blockers = [...new Set(components.flatMap((component) => component.blockers ?? []))];
  return {
    schema_version: 'genos-benchmark-report-v1',
    task_id: task.id,
    benchmark_id: task.benchmark_id,
    deliverable: task.deliverable,
    title: suite.title,
    generated_at: generatedAt,
    repository_revision: revision,
    repository: { revision },
    public_benchmark: true,
    execution_status: status,
    execution: {
      status,
      attempted: status === 'executed_pending_audit' || status === 'execution_failed',
    },
    approvals,
    aggregate_score: null,
    aggregate_score_reason: 'Constituent public benchmark scores use different scales and are not averaged.',
    score: null,
    sample_size: executed.reduce((total, component) => total + (component.sample_count ?? 0), 0),
    components,
    metrics: executed.map((component) => ({
      name: component.id + '.native_score',
      status: 'measured_pending_audit',
      value: component.score,
    })),
    evidence: {
      commands: components.filter((component) => component.evidence).map((component) => ({
        component_id: component.id,
        ...component.evidence,
      })),
      sources: ['benchmarks/public-gates.json', 'benchmarks/public-suites.json'],
    },
    audit: {
      status: status === 'executed_pending_audit' ? 'pending' : 'not_submitted',
      decision,
      agent_role: 'benchmark_evidence_auditor',
      review_agent: 'evidence-auditor',
      rationale: status === 'executed_pending_audit'
        ? 'Native component results were captured but have not been approved by the evidence auditor.'
        : 'No public claim is permitted while external gates are missing or execution has failed.',
    },
    claim_status: 'not_claimable',
    claim_allowed: false,
    gate_policy: gatePolicy.policy_version,
    gates,
    blockers,
    limitations: blockers.length > 0 ? blockers : ['Evidence auditor approval is pending.'],
  };
}

export function runPublicBenchmarks(options, dependencies = {}) {
  const environment = dependencies.environment ?? process.env;
  const now = dependencies.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const runId = generatedAt.replace(/[:.]/g, '-');
  const outputDir = path.resolve(options.outputDir ?? path.join(benchmarkRoot, 'workspace', 'runs', runId, 'public'));
  const backlog = readJson(path.join(benchmarkRoot, 'backlog.json'));
  const portfolio = readJson(path.join(benchmarkRoot, 'portfolio.json'));
  const manifest = readJson(path.join(benchmarkRoot, 'public-suites.json'));
  const gatePolicy = readJson(path.join(benchmarkRoot, 'public-gates.json'));
  const approval = loadApproval(options.approvalFile);
  const taskById = new Map(backlog.tasks.map((task) => [task.id, task]));
  const benchmarkById = new Map(portfolio.benchmarks.map((benchmark) => [benchmark.id, benchmark]));
  const revision = repositoryRevision();
  const reports = [];

  fs.mkdirSync(outputDir, { recursive: true });

  for (const taskId of options.taskIds) {
    const task = taskById.get(taskId);
    const suite = manifest.tasks[taskId];
    if (!task || !suite) throw new Error('Unknown public benchmark task: ' + taskId);
    if (task.benchmark_id !== suite.benchmark_id) {
      throw new Error(taskId + ' benchmark mismatch between backlog and public-suites.json');
    }
    const benchmark = benchmarkById.get(task.benchmark_id);
    if (!benchmark?.public) throw new Error(taskId + ' is not a public benchmark');
    const gate = gatePolicy.tasks[taskId];
    if (!gate || gate.benchmark_id !== task.benchmark_id) {
      throw new Error(taskId + ' benchmark mismatch between backlog and public-gates.json');
    }

    const approvals = approvalState(approval, taskId);
    let components = suite.components.map((component) => componentPreflight(component, approvals, environment));
    let status = components.every((component) => component.status === 'ready')
      ? 'ready_for_external_execution'
      : blockedStatus(components, approvals);

    if (options.execute && status === 'ready_for_external_execution') {
      const completed = [];
      for (let index = 0; index < components.length; index += 1) {
        const component = components[index];
        try {
          completed.push(executeComponent(component, {
            taskId,
            outputDir,
            requiredFields: manifest.result_contract.required_fields,
            environment,
            timeoutMs: task.budget?.max_duration_ms ?? backlog.default_budget.max_duration_ms,
          }));
        } catch (error) {
          completed.push({
            ...component,
            status: 'execution_failed',
            evidence: error.evidence ?? null,
            blockers: [error.message],
          });
          for (const pending of components.slice(index + 1)) {
            completed.push({
              ...pending,
              status: 'not_started_after_component_failure',
              blockers: ['a preceding component failed'],
            });
          }
          break;
        }
      }
      components = completed;
      status = components.every((component) => component.status === 'executed_pending_audit')
        ? 'executed_pending_audit'
        : 'execution_failed';
    }

    const report = createReport({
      task,
      suite: { ...suite, title: benchmark.title },
      approvals,
      components,
      status,
      generatedAt,
      revision,
      gatePolicy,
    });
    fs.writeFileSync(path.join(outputDir, task.deliverable), JSON.stringify(report, null, 2) + '\n');
    reports.push({ task_id: taskId, deliverable: task.deliverable, status, claim_status: report.claim_status });
  }

  const summary = {
    schema_version: 1,
    run_id: runId,
    generated_at: generatedAt,
    repository_revision: revision,
    output_dir: outputDir,
    execute_requested: options.execute,
    reports,
  };
  fs.writeFileSync(path.join(outputDir, 'public-benchmark-run.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

function main() {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const summary = runPublicBenchmarks(options);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.reports.some((report) => report.status === 'execution_failed')) {
      process.exitCode = 1;
    } else if (options.execute && summary.reports.some((report) => report.status !== 'executed_pending_audit')) {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('public benchmark runner: ' + error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
