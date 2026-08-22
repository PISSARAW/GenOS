#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const benchmarkRoot = path.dirname(scriptPath);
const repositoryRoot = path.dirname(benchmarkRoot);
const cargoTargetDir = process.env.GENOS_BENCHMARK_TARGET_DIR || path.join(repositoryRoot, 'target');
const defaultSystems = ['langgraph', 'autogen', 'crewai', 'langfuse', 'braintrust', 'phoenix', 'semantic-kernel'];
const benchmarkSourcePaths = [
  'benchmarks/run-specialist.mjs',
  'benchmarks/adapters/genos-observability.json',
  'crates/genos-store/Cargo.toml',
  'crates/genos-store/src/bin/replay_benchmark.rs',
  'crates/genos-store/src/replay.rs',
  'crates/genos-world/src/bin/world_benchmark.rs',
  'crates/genos-world/src/world/directory.rs',
];

function positiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseArguments(argv) {
  const options = {
    tasks: ['B04', 'B10'],
    iterations: 500,
    events: 100,
    warmups: 20,
    outputDir: path.join(benchmarkRoot, 'results'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--tasks') {
      if (!value) throw new Error('--tasks requires a comma-separated value');
      options.tasks = value.split(',').map((task) => task.trim()).filter(Boolean);
      index += 1;
    } else if (argument === '--iterations') {
      options.iterations = positiveInteger(value, '--iterations');
      index += 1;
    } else if (argument === '--events') {
      options.events = positiveInteger(value, '--events');
      index += 1;
    } else if (argument === '--warmups') {
      options.warmups = positiveInteger(value, '--warmups');
      index += 1;
    } else if (argument === '--output-dir') {
      if (!value) throw new Error('--output-dir requires a value');
      options.outputDir = path.resolve(repositoryRoot, value);
      index += 1;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  const unknown = options.tasks.filter((task) => !['B04', 'B10'].includes(task));
  if (unknown.length > 0 || options.tasks.length === 0) {
    throw new Error(`--tasks only accepts B04 and B10 (received ${options.tasks.join(',')})`);
  }
  return options;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      `${command} ${args.join(' ')} failed with exit code ${result.status}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function runEvidence(id, command, args) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const record = {
    id,
    command: [command, ...args],
    exit_code: result.status,
    passed: result.status === 0,
    duration_ms: Number(process.hrtime.bigint() - started) / 1_000_000,
    output_sha256: crypto.createHash('sha256').update(output).digest('hex'),
  };
  if (!record.passed) {
    throw new Error(`${id} failed with exit code ${result.status}\n${output}`);
  }
  return record;
}

function repositoryRevision() {
  return run('git', ['rev-parse', 'HEAD']);
}

function sourceHashes() {
  return Object.fromEntries(benchmarkSourcePaths.map((relativePath) => {
    const content = fs.readFileSync(path.join(repositoryRoot, relativePath));
    return [relativePath, crypto.createHash('sha256').update(content).digest('hex')];
  }));
}

function repositoryState() {
  return {
    revision: repositoryRevision(),
    dirty: run('git', ['status', '--porcelain']).length > 0,
    benchmark_source_sha256: sourceHashes(),
  };
}

function benchmarkBinary(packageName, binaryName, args) {
  const stdout = run('cargo', [
    'run', '--quiet', '--release', '--target-dir', cargoTargetDir,
    '-p', packageName, '--bin', binaryName, '--', ...args,
  ]);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`${binaryName} did not produce valid JSON: ${error.message}\n${stdout}`);
  }
}

function percentile(sorted, quantile) {
  const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
  return sorted[Math.min(index, sorted.length - 1)];
}

export function validateDistribution(distribution, expectedCount, label) {
  if (!distribution || !Array.isArray(distribution.samples)) {
    throw new Error(`${label} is missing raw samples`);
  }
  if (distribution.count !== expectedCount || distribution.samples.length !== expectedCount) {
    throw new Error(`${label} expected ${expectedCount} samples, got ${distribution.samples.length}`);
  }
  if (distribution.samples.some((sample) => !Number.isFinite(sample) || sample < 0)) {
    throw new Error(`${label} contains an invalid sample`);
  }
  const sorted = [...distribution.samples].sort((left, right) => left - right);
  if (sorted.some((sample, index) => sample !== distribution.samples[index])) {
    throw new Error(`${label} samples must be sorted`);
  }
  const mean = sorted.reduce((sum, sample) => sum + sample, 0) / sorted.length;
  const variance = sorted.reduce((sum, sample) => sum + ((sample - mean) ** 2), 0) / sorted.length;
  const expected = {
    min: sorted[0],
    max: sorted.at(-1),
    p50: percentile(sorted, 0.50),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
  };
  for (const [field, value] of Object.entries(expected)) {
    if (distribution[field] !== value) {
      throw new Error(`${label}.${field} is inconsistent with raw samples`);
    }
  }
  const tolerance = Math.max(1e-6, Math.abs(mean) * 1e-12);
  if (Math.abs(distribution.mean - mean) > tolerance) {
    throw new Error(`${label}.mean is inconsistent with raw samples`);
  }
  if (Math.abs(distribution.stddev - Math.sqrt(variance)) > tolerance) {
    throw new Error(`${label}.stddev is inconsistent with raw samples`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

export function verifyEvidence(manifest, root = repositoryRoot) {
  return manifest.dimensions.map((dimension) => {
    const evidence = dimension.evidence.map((locator) => {
      const absolute = path.join(root, locator.path);
      const exists = fs.existsSync(absolute);
      const content = exists ? fs.readFileSync(absolute) : null;
      const matched = Boolean(content && content.toString('utf8').includes(locator.contains));
      return {
        ...locator,
        verified: matched,
        sha256: content ? crypto.createHash('sha256').update(content).digest('hex') : null,
      };
    });
    if (evidence.some((locator) => !locator.verified)) {
      throw new Error(`stale evidence for ${manifest.system_id}.${dimension.id}`);
    }
    return { ...dimension, evidence, evidence_status: 'verified' };
  });
}

function runB04(options, generatedAt, repository) {
  const replay = benchmarkBinary('genos-store', 'replay_benchmark', [
    '--iterations', String(options.iterations),
    '--events', String(options.events),
    '--warmups', String(options.warmups),
  ]);
  const worldFork = benchmarkBinary('genos-world', 'world_benchmark', [
    '--iterations', String(options.iterations),
    '--warmups', String(options.warmups),
  ]);
  validateDistribution(replay.durations_ns, options.iterations, 'replay.durations_ns');
  validateDistribution(worldFork.fork_latency_ns, options.iterations, 'world_fork.fork_latency_ns');
  if (replay.repository_revision !== repository.revision || worldFork.repository_revision !== repository.revision) {
    throw new Error('benchmark binaries and coordinator observed different repository revisions');
  }
  if (JSON.stringify(sourceHashes()) !== JSON.stringify(repository.benchmark_source_sha256)) {
    throw new Error('benchmark sources changed while B04 was running');
  }
  const samePlatform = JSON.stringify(replay.platform) === JSON.stringify(worldFork.platform);
  const report = {
    schema_version: 1,
    task_id: 'B04',
    benchmark_id: 'genos.performance',
    deliverable: 'performance-distribution.json',
    status: 'completed',
    execution_status: 'completed',
    generated_at: generatedAt,
    repository,
    scenario: {
      events_per_replay: options.events,
      measured_iterations: options.iterations,
      warmups: options.warmups,
      duration_unit: 'nanoseconds',
    },
    measurements: { replay, world_fork: worldFork },
    validation: {
      raw_distributions_included: true,
      statistics_recomputed: true,
      replay_fingerprint_checked_each_iteration: true,
      same_platform: samePlatform,
    },
    limitations: [
      'These are local runtime microbenchmarks; they exclude model and network latency.',
      'The directory-provider fork copies a directory and is not a Copy-on-Write measurement.',
      'Population standard deviation describes the captured run and is not a cross-machine confidence bound.',
    ],
  };
  writeJson(path.join(options.outputDir, 'performance-distribution.json'), report);
  return report;
}

function unsupportedSystem(systemId, dimensionIds) {
  return {
    system_id: systemId,
    assessment_kind: 'external_adapter',
    adapter_status: 'not_run',
    dimensions: dimensionIds.map((id) => ({
      id,
      status: 'unsupported',
      reason: 'No version-pinned adapter was present and executed for this run.',
    })),
  };
}

function runB10(context) {
  const { options, generatedAt, repository, performanceReport } = context;
  const runtimeEvidence = [
    runEvidence('evaluation-observability', 'node', ['backend/test_evaluation_observability.js']),
    runEvidence('platform-control-plane', 'node', ['--test', 'backend/test_platform_safety.js']),
  ];
  const manifestPath = path.join(benchmarkRoot, 'adapters', 'genos-observability.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const genosDimensions = verifyEvidence(manifest);
  const dimensionIds = genosDimensions.map((dimension) => dimension.id);
  const systems = [
    {
      system_id: 'genos',
      version: repository.revision,
      assessment_kind: manifest.assessment_kind,
      adapter_status: 'evidence_verified',
      dimensions: genosDimensions,
      measured_runtime: performanceReport ? {
        source_task: 'B04',
        replay_duration_ns: performanceReport.measurements.replay.durations_ns,
        fork_latency_ns: performanceReport.measurements.world_fork.fork_latency_ns,
      } : { status: 'not_measured_in_this_invocation' },
    },
    ...defaultSystems.map((systemId) => unsupportedSystem(systemId, dimensionIds)),
  ];
  const report = {
    schema_version: 1,
    task_id: 'B10',
    benchmark_id: 'comparative.observability',
    deliverable: 'observability-comparison.json',
    status: 'completed_with_external_adapters_missing',
    execution_status: 'completed_with_external_adapters_missing',
    generated_at: generatedAt,
    repository,
    comparison_eligible: false,
    claim_allowed: false,
    comparison_blocker: 'Only GenOS repository evidence was verified; no external system adapter was version-pinned and executed.',
    runtime_evidence: {
      status: 'verified',
      commands: runtimeEvidence,
    },
    cost_model: {
      benchmark_model_calls: 0,
      benchmark_token_cost: { status: 'not_applicable', reason: 'The local B04 workload performs no model calls.' },
      external_system_costs: { status: 'unsupported', reason: 'External adapters were not run.' },
    },
    systems,
    methodology: {
      unsupported_rule: 'A missing or unexecuted adapter is reported as unsupported, never as a zero-valued result.',
      repository_evidence_is_not_runtime_interoperability_proof: true,
      external_execution_requires_human_approval: true,
    },
  };
  writeJson(path.join(options.outputDir, 'observability-comparison.json'), report);
  return report;
}

function loadPerformanceReport(options, repository) {
  const reportPath = path.join(options.outputDir, 'performance-distribution.json');
  if (!fs.existsSync(reportPath)) return null;
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (report.task_id !== 'B04' || report.repository?.revision !== repository.revision) return null;
  validateDistribution(report.measurements?.replay?.durations_ns, options.iterations, 'replay.durations_ns');
  validateDistribution(report.measurements?.world_fork?.fork_latency_ns, options.iterations, 'world_fork.fork_latency_ns');
  return report;
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const generatedAt = new Date().toISOString();
  const repository = repositoryState();
  const reports = {};
  if (options.tasks.includes('B04')) {
    reports.B04 = runB04(options, generatedAt, repository);
  }
  if (options.tasks.includes('B10')) {
    reports.B10 = runB10({
      options,
      generatedAt,
      repository,
      performanceReport: reports.B04 || loadPerformanceReport(options, repository),
    });
  }
  process.stdout.write(`${JSON.stringify({ output_dir: options.outputDir, reports: Object.keys(reports) }, null, 2)}\n`);
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
