'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { performance } = require('node:perf_hooks');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const RUNTIME = path.join(__dirname, 'langgraph-runtime');
const graphRequire = createRequire(path.join(RUNTIME, 'package.json'));
const { Annotation, END, START, StateGraph } = graphRequire('@langchain/langgraph');
const { SqliteSaver } = graphRequire('@langchain/langgraph-checkpoint-sqlite');
const reference = require('./json_reference.cjs');
const EXPERIMENTS = ['E05', 'E06', 'E07', 'E10'];
const REPETITIONS = 3;

function readRows() {
  return EXPERIMENTS.flatMap((experiment) => reference.readRows(
    path.join(ROOT, 'dataset', 'public', 'inputs', `${experiment}.jsonl`)));
}

function createGraph(validator, saver, failureState) {
  const state = Annotation.Root({ scenario: Annotation(), answer: Annotation(),
    metrics: Annotation() });
  const execute = async (input) => {
    const row = input.scenario;
    if (row.experiment_id === 'E06') {
      const recovery = await recoverEffects(row, saver, failureState);
      return { answer: reference.execute(row, validator), metrics: recovery };
    }
    return { answer: reference.execute(row, validator), metrics: {} };
  };
  return new StateGraph(state).addNode('execute_case', execute)
    .addEdge(START, 'execute_case').addEdge('execute_case', END).compile({ checkpointer: saver });
}

async function recoverEffects(row, saver, failureState) {
  const { scenario_id: id, input } = row;
  const effectId = `${failureState.threadId}/${input.effect_key}`;
  const insert = saver.db.prepare('INSERT OR IGNORE INTO omega_effects (effect_id) VALUES (?)');
  const count = saver.db.prepare('SELECT COUNT(*) AS count FROM omega_effects WHERE effect_id = ?');
  const injected = failureState.injected.has(id);
  insert.run(effectId);
  if (!injected) {
    failureState.injected.add(id);
    throw new Error('Injected failure after durable idempotent effect.');
  }
  return { recovered_after_injected_failure: true, irreversible_effect_count: count.get(effectId).count };
}

async function stateHistory(graph, config) {
  let count = 0;
  for await (const snapshot of graph.getStateHistory(config)) {
    if (snapshot) count += 1;
  }
  return count;
}

async function runScenario(row, repetition, context) {
  const threadId = `omega-${row.scenario_id}-r${repetition}`;
  const config = { configurable: { thread_id: threadId } };
  const serialized = JSON.stringify(row.input);
  const started = performance.now();
  let output;
  let replayMatches = true;
  if (row.experiment_id === 'E05') {
    const copies = [];
    for (let replay = 0; replay < row.input.replay_count; replay += 1) {
      const replayConfig = { configurable: { thread_id: `${threadId}-replay-${replay}` } };
      const state = await context.graph.invoke({ scenario: row }, replayConfig);
      copies.push(state.answer);
    }
    replayMatches = copies.every((answer) => JSON.stringify(answer) === JSON.stringify(copies[0]));
    output = { answer: copies[0], metrics: { replay_matches: replayMatches,
      checkpoint_count: await stateHistory(context.graph, {
        configurable: { thread_id: `${threadId}-replay-0` } }) } };
  } else {
    try {
      output = await context.graph.invoke({ scenario: row }, config);
    } catch (error) {
      if (row.experiment_id !== 'E06' || !error.message.includes('Injected failure')) throw error;
      output = await context.graph.invoke({ scenario: row }, config);
    }
    output.metrics = { ...output.metrics,
      checkpoint_count: await stateHistory(context.graph, config) };
  }
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'LANGGRAPH', repetition, status: 'completed', answer: output.answer,
    metrics: output.metrics,
    telemetry: { latency_ms: performance.now() - started, input_bytes: Buffer.byteLength(serialized),
      output_bytes: Buffer.byteLength(JSON.stringify(output.answer)), input_tokens: null,
      output_tokens: null, cost_usd: null }
  };
}

function saveResults(rows, results, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${results.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = {
    protocol: 'OMEGA-BENCH-2026', condition_id: 'LANGGRAPH',
    status: 'scoped_external_baseline', scope: EXPERIMENTS,
    scenarios: rows.length, repetitions: REPETITIONS, runs: results.length,
    sdk: '@langchain/langgraph@1.5.3 + @langchain/langgraph-checkpoint-sqlite@1.1.0',
    repository_revision: require('node:child_process').execFileSync(
      'git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(),
    adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'),
    dataset_manifest_sha256: crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ROOT, 'dataset', 'manifest.json'))).digest('hex'),
    runtime: { node: process.version, platform: process.platform, arch: process.arch,
      cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() }, external_model_calls: 0
  };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`);
}

async function main() {
  const rows = readRows();
  const validator = reference.createValidator();
  const databasePath = path.join(os.tmpdir(), `omega-langgraph-${crypto.randomUUID()}.sqlite`);
  const saver = SqliteSaver.fromConnString(databasePath);
  saver.db.exec('CREATE TABLE IF NOT EXISTS omega_effects (effect_id TEXT PRIMARY KEY)');
  const failureState = { injected: new Set(), threadId: '' };
  const graph = createGraph(validator, saver, failureState);
  const results = [];
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'LANGGRAPH-baseline.jsonl');
  try {
    for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
      for (const row of rows) {
        failureState.threadId = `omega-${row.scenario_id}-r${repetition}`;
        results.push(await runScenario(row, repetition, { graph }));
      }
    }
    saveResults(rows, results, outputPath);
  } finally {
    saver.db.close();
  }
  process.stdout.write(`LangGraph baseline complete: ${results.length} runs across ${rows.length} cases.\n`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
