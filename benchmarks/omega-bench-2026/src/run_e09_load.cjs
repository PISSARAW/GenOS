'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const reference = require('../adapters/json_reference.cjs');
const interop = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaInteropService'));
const compiler = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaCompiler'));
const runtimeModule = require(path.resolve(__dirname, '..', '..', '..', 'backend',
  'src', 'services', 'cognitiveOmegaRuntimeService'));

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const DEFAULT_SCALES = [10, 100, 1000, 10000];
const REPETITIONS = 3;
const SOAK_SCALE = 10000;
const SOAK_MIN_CYCLES = 8;
const MIB = 1024 * 1024;
const GROWTH_RULE = { warmup_cycles_excluded: 1, comparison_window_cycles: 3,
  rss_delta_threshold_bytes: 16 * MIB, heap_delta_threshold_bytes: 8 * MIB,
  signal: 'growth_signal if either final-window median delta exceeds its threshold' };

function optionValue(args, prefix) {
  return args.find((value) => value.startsWith(prefix));
}

function parseScales(value) {
  const scales = value ? value.slice(9).split(',').map(Number) : DEFAULT_SCALES;
  if (!scales.length || scales.some((value) => ![...DEFAULT_SCALES].includes(value))) {
    throw new Error('scales must be selected from 10,100,1000,10000');
  }
  return scales;
}

function parseRepetitions(value) {
  const repetitions = value ? Number(value.slice(14)) : REPETITIONS;
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
    throw new Error('repetitions must be an integer from 1 to 5');
  }
  return repetitions;
}

function parseSoakCycles(value) {
  const soakCycles = value ? Number(value.slice(14)) : 0;
  if (!Number.isInteger(soakCycles) || (soakCycles !== 0
      && (soakCycles < SOAK_MIN_CYCLES || soakCycles > 100))) {
    throw new Error(`soak-cycles must be 0 or an integer from ${SOAK_MIN_CYCLES} to 100`);
  }
  return soakCycles;
}

function parseOutput(value) {
  return value ? value.slice(9) : path.join(ROOT, 'results', 'E09-load.json');
}

function parseOptions(args) {
  const scales = parseScales(optionValue(args, '--scales='));
  const repetitions = parseRepetitions(optionValue(args, '--repetitions='));
  const soakCycles = parseSoakCycles(optionValue(args, '--soak-cycles='));
  const output = parseOutput(optionValue(args, '--output='));
  return { scales, repetitions, soakCycles, output };
}

function operationGraph() {
  const operations = [
    { id: 'read', kind: 'READ', reference: 'load/input', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'load/input', dependsOn: ['read'], state: 'open' },
    { id: 'call', kind: 'CALL', reference: 'load/E09', dependsOn: ['select'], state: 'open' }
  ];
  const envelope = { schema: interop.SCHEMA, version: 1, id: 'E09-load', operations,
    policy: { read: ['load/input'], select: ['load/input'], call: ['load/E09'] }, payload: {} };
  const validation = interop.validate(envelope);
  if (!validation.valid) throw new Error(`envelope_invalid:${validation.errors.join(',')}`);
  const compiled = compiler.compile({ operations, targets: ['call'], model: 'E09-load-test' });
  if (compiled.status !== 'ready') throw new Error(`compile_${compiled.status}`);
  return compiled.slice.nodes;
}

function payloadFor(agentIndex, scenarios) {
  const source = scenarios[agentIndex % scenarios.length].input;
  return { command_count: source.command_count,
    command_value_start: source.command_value_start + agentIndex * 31,
    simulated_agents: 1, mission_workload: source.mission_workload };
}

function expectedE09(input) {
  const count = input.command_count;
  const start = input.command_value_start;
  return { processed_count: count, checksum: count * (2 * start + count - 1) / 2 };
}

async function executeAgent(agentIndex, scenarios, operations) {
  const started = performance.now();
  const input = payloadFor(agentIndex, scenarios);
  const runtime = runtimeModule.createRuntime();
  runtime.registerReader('load/input', async () => input);
  runtime.registerTool('load/E09', async ({ input: payload }) => reference.execute(
    { experiment_id: 'E09', input: payload }, null));
  const result = await runtime.execute({ operations,
    policy: { read: ['load/input'], select: ['load/input'], call: ['load/E09'] }, allowEmit: true });
  const latency = performance.now() - started;
  const expected = expectedE09(input);
  expected.mission_execution = reference.executeMissionWorkload(input.mission_workload);
  const correct = result.status === 'emitted'
    && JSON.stringify(result.values.call) === JSON.stringify(expected);
  return { correct, latency, commands: input.command_count };
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] || 0;
}

function memoryBytes() {
  const memory = process.memoryUsage();
  return { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external };
}

function maxRssBytes() {
  const value = process.resourceUsage().maxRSS;
  return process.platform === 'win32' ? value : value * 1024;
}

function updatePeak(peak, sample) {
  return { rss: Math.max(peak.rss, sample.rss), heapUsed: Math.max(peak.heapUsed, sample.heapUsed),
    external: Math.max(peak.external, sample.external) };
}

function startMemorySampler() {
  let peak = memoryBytes();
  const timer = setInterval(() => { peak = updatePeak(peak, memoryBytes()); }, 10);
  return { stop: () => {
    clearInterval(timer);
    peak = updatePeak(peak, memoryBytes());
    return peak;
  } };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function memoryGrowth(samples, key) {
  const settled = samples.slice(1).map((sample) => sample[key]);
  const width = GROWTH_RULE.comparison_window_cycles;
  const initial = median(settled.slice(0, width));
  const final = median(settled.slice(-width));
  return { initial_window_median_bytes: initial, final_window_median_bytes: final,
    delta_bytes: final - initial };
}

function soakAssessment(cycles) {
  const rss = memoryGrowth(cycles, 'rss_after');
  const heap = memoryGrowth(cycles, 'heap_after');
  return { rule: GROWTH_RULE, rss, heap,
    classification: rss.delta_bytes > GROWTH_RULE.rss_delta_threshold_bytes
      || heap.delta_bytes > GROWTH_RULE.heap_delta_threshold_bytes
      ? 'growth_signal' : 'no_growth_signal_under_rule',
    interpretation: 'descriptive repeated-load signal only; neither class proves bounded memory' };
}

async function runScale(options) {
  const { scale, repetition, scenarios, operations, sampleMemory = false } = options;
  const before = memoryBytes();
  const processPeakBefore = maxRssBytes();
  if (sampleMemory) await new Promise((resolve) => setImmediate(resolve));
  const sampler = sampleMemory ? startMemorySampler() : null;
  const started = performance.now();
  const agents = await Promise.all(Array.from({ length: scale }, (_, index) =>
    executeAgent(index, scenarios, operations)));
  const elapsedMs = performance.now() - started;
  if (sampleMemory) await new Promise((resolve) => setImmediate(resolve));
  const after = memoryBytes();
  const sampledHighwater = sampler?.stop() || null;
  const processPeakAfter = maxRssBytes();
  const commands = agents.reduce((sum, item) => sum + item.commands, 0);
  const correct = agents.filter((item) => item.correct).length;
  const latency = agents.map((item) => item.latency);
  return { agents: scale, repetition, elapsed_ms: elapsedMs,
    agents_per_second: scale / (elapsedMs / 1000), logical_commands_total: commands,
    logical_commands_per_second: commands / (elapsedMs / 1000), processed_rate: correct / scale,
    latency_ms: { p50: percentile(latency, 0.50), p95: percentile(latency, 0.95),
      p99: percentile(latency, 0.99), max: Math.max(...latency) },
    memory_bytes: { before, after,
      process_highwater_rss_before: processPeakBefore,
      process_highwater_rss_after: processPeakAfter,
      process_highwater_rss_growth: Math.max(0, processPeakAfter - processPeakBefore),
      sampled_highwater: sampledHighwater },
    correct_agents: correct, incorrect_agents: scale - correct };
}

function manifestFor(options, results, initialMemory) {
  const datasetManifest = path.join(DATASET_ROOT, 'manifest.json');
  return { protocol: 'OMEGA-BENCH-2026', experiment_id: 'E09',
    status: options.soakCycles ? 'public_development_repeated_soak' : 'public_development_load_test',
    scales: options.soakCycles ? [SOAK_SCALE] : options.scales,
    repetitions: options.soakCycles ? 1 : options.repetitions,
    cases_sha256: crypto.createHash('sha256').update(fs.readFileSync(
      path.join(DATASET_ROOT, 'public', 'inputs', 'E09.jsonl'))).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(datasetManifest)).digest('hex'),
    repository_revision: execFileSync('git', ['rev-parse', 'HEAD'],
      { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, cpu_count: os.cpus().length,
      memory_bytes: os.totalmem(), initial_process_memory_bytes: initialMemory },
    execution_model: 'single Node.js process; concurrent async runtime invocations; not OS processes or real GenOS agents',
    external_model_calls: 0,
    soak: options.soakCycles ? { cycles: options.soakCycles, invocations_per_cycle: SOAK_SCALE,
      total_invocations: options.soakCycles * SOAK_SCALE, growth_assessment: soakAssessment(results),
      limitations: ['single Node.js process', 'concurrent async invocations, not OS agents',
        'sampled memory and process high-water are observational', 'no mathematical or production bound'] } : null,
    results };
}

async function runSoakCycle(cycle, scenarios, operations) {
  const observation = await runScale({ scale: SOAK_SCALE, repetition: cycle,
    scenarios, operations, sampleMemory: true });
  return { ...observation, cycle, rss_after: observation.memory_bytes.after.rss,
    heap_after: observation.memory_bytes.after.heapUsed };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const initialMemory = memoryBytes();
  const scenarios = reference.readRows(path.join(DATASET_ROOT, 'public', 'inputs', 'E09.jsonl'));
  const operations = operationGraph();
  const results = [];
  if (options.soakCycles) {
    for (let cycle = 1; cycle <= options.soakCycles; cycle += 1) {
      results.push(await runSoakCycle(cycle, scenarios, operations));
      process.stdout.write(`${JSON.stringify(results[results.length - 1])}\n`);
    }
  } else {
    for (const scale of options.scales) {
      for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
        results.push(await runScale({ scale, repetition, scenarios, operations }));
        process.stdout.write(`${JSON.stringify(results[results.length - 1])}\n`);
      }
    }
  }
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output,
    `${JSON.stringify(manifestFor(options, results, initialMemory), null, 2)}\n`);
}

if (require.main === module) main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
