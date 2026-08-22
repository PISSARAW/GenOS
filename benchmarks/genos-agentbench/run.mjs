#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const suite = JSON.parse(readFileSync(path.join(here, 'suite.json'), 'utf8'));
const resultsRoot = path.join(here, 'results');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(resultsRoot, 'runs', runId);
const schema = path.join(here, 'response.schema.json');
const mcpBinary = path.join(root, 'target/debug/genos-mcp');
const genosBinary = path.join(root, 'target/debug/genos');

function option(name, fallback) {
  const direct = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const repetitions = Number.parseInt(option('--repetitions', '3'), 10);
const requestedModels = option('--models', '').split(',').filter(Boolean);
const requestedTasks = option('--tasks', '').split(',').filter(Boolean);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 30) throw new Error('repetitions must be 1..30');

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
function modelCatalog() {
  const result = run('codex', ['debug', 'models']);
  if (result.status !== 0) throw new Error(result.stderr);
  const parsed = JSON.parse(result.stdout);
  return (parsed.models ?? parsed).filter((model) => model.visibility === 'list').map((model) => model.slug);
}
function parseEvents(text) {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}
function parseTap(text) {
  const pass = Number(text.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  const fail = Number(text.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  return { pass, fail, total: pass + fail, score: pass + fail > 0 ? 100 * pass / (pass + fail) : 0 };
}
function gitVersion(command, args) { const result = run(command, args); return result.status === 0 ? result.stdout.trim() : 'unavailable'; }
function hashFiles(directory) {
  const result = run('shasum', ['-a', '256', ...['task.md', 'public.test.mjs'].map((file) => path.join(directory, file))]);
  return result.status === 0 ? result.stdout : '';
}
function genosCalls(events) {
  return events.filter((event) => {
    const item = event.item ?? {};
    return event.type === 'item.completed' && (item.type ?? '').includes('mcp')
      && `${item.server ?? ''} ${item.name ?? ''}`.toLowerCase().includes('genos');
  }).length;
}

const prompt = `Read task.md and repair the implementation. Preserve the public API and do not edit task.md or public.test.mjs.
Run the public test and add focused tests if useful. Do not access files outside the current task directory.
If GenOS tools are available, use them to record at least two falsifiable hypotheses and compare evidence before selecting the patch.
Return only the requested JSON summary after the implementation and validation are complete.`;

function execute(model, task, condition, repetition) {
  const caseDir = path.join(runDir, `${model}__${task.id}__r${repetition}__${condition}`);
  const workspace = path.join(caseDir, 'workspace');
  mkdirSync(caseDir, { recursive: true });
  cpSync(path.join(here, 'tasks', task.id), workspace, { recursive: true });
  const protectedBefore = hashFiles(workspace);
  const response = path.join(caseDir, 'response.json');
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never', '--skip-git-repo-check',
    '--sandbox', 'workspace-write', '--model', model, '-c', 'model_reasoning_effort="medium"', '--cd', workspace,
    '--output-schema', schema, '--output-last-message', response];
  if (condition === 'genos') {
    args.push('-c', `mcp_servers.genos.command=${JSON.stringify(mcpBinary)}`,
      '-c', 'mcp_servers.genos.args=["stdio"]', '-c', `mcp_servers.genos.cwd=${JSON.stringify(workspace)}`,
      '-c', `mcp_servers.genos.env={GENOS_WORKSPACE_ROOT=${JSON.stringify(workspace)},GENOS_BIN=${JSON.stringify(genosBinary)}}`,
      '-c', 'mcp_servers.genos.startup_timeout_sec=30', '-c', `mcp_servers.genos.tool_timeout_sec=${task.max_seconds}`);
  }
  args.push(prompt);
  const started = performance.now();
  const agent = run('codex', args, { timeout: task.max_seconds * 1000 });
  const durationMs = Math.round(performance.now() - started);
  writeFileSync(path.join(caseDir, 'events.jsonl'), agent.stdout);
  writeFileSync(path.join(caseDir, 'stderr.log'), agent.stderr);
  const grader = run('node', ['--test', path.join(here, task.grader)], {
    cwd: workspace, env: { ...process.env, TARGET_DIR: workspace }, timeout: task.max_seconds * 1000,
  });
  writeFileSync(path.join(caseDir, 'grader.tap'), grader.stdout + grader.stderr);
  const grade = parseTap(grader.stdout);
  const events = parseEvents(agent.stdout);
  const completion = events.findLast((event) => event.type === 'turn.completed');
  const integrity = protectedBefore === hashFiles(workspace);
  rmSync(path.join(workspace, '.genos'), { recursive: true, force: true });
  return {
    model, task_id: task.id, difficulty: task.difficulty, repetition, condition,
    agent_exit_code: agent.status, grader_exit_code: grader.status, functional_score: grade.score,
    hidden_checks_passed: grade.pass, hidden_checks_total: grade.total, protected_files_intact: integrity,
    duration_ms: durationMs, usage: completion?.usage ?? null, genos_mcp_tool_calls: genosCalls(events),
    artifacts: path.relative(root, caseDir),
  };
}

function aggregate(samples, condition) {
  const rows = samples.filter((sample) => sample.condition === condition);
  return {
    runs: rows.length,
    mean_functional_score: rows.reduce((sum, row) => sum + row.functional_score, 0) / rows.length,
    perfect_run_rate: rows.filter((row) => row.functional_score === 100).length / rows.length,
    protected_file_integrity_rate: rows.filter((row) => row.protected_files_intact).length / rows.length,
    mean_duration_ms: rows.reduce((sum, row) => sum + row.duration_ms, 0) / rows.length,
    input_tokens: rows.reduce((sum, row) => sum + (row.usage?.input_tokens ?? 0), 0),
    output_tokens: rows.reduce((sum, row) => sum + (row.usage?.output_tokens ?? 0), 0),
    genos_mcp_tool_calls: rows.reduce((sum, row) => sum + row.genos_mcp_tool_calls, 0),
  };
}
function pairedBootstrap(samples, iterations = 10000) {
  const groups = new Map();
  for (const row of samples) {
    const key = `${row.model}|${row.task_id}|${row.repetition}`;
    const pair = groups.get(key) ?? {}; pair[row.condition] = row.functional_score; groups.set(key, pair);
  }
  const deltas = [...groups.values()].filter((pair) => pair.standard != null && pair.genos != null).map((pair) => pair.genos - pair.standard);
  let state = 0x5eed1234; const random = () => ((state = (1664525 * state + 1013904223) >>> 0) / 2 ** 32);
  const boots = Array.from({ length: iterations }, () => Array.from({ length: deltas.length }, () => deltas[Math.floor(random() * deltas.length)]).reduce((a, b) => a + b, 0) / deltas.length).sort((a, b) => a - b);
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  return { pairs: deltas.length, mean_score_delta: mean, ci95: [boots[Math.floor(iterations * .025)], boots[Math.floor(iterations * .975)]] };
}

mkdirSync(runDir, { recursive: true });
const build = run('cargo', ['build', '--quiet', '-p', 'genos-mcp', '-p', 'genos-cli']);
if (build.status !== 0) throw new Error(build.stderr);
const available = modelCatalog();
const models = requestedModels.length ? requestedModels : available;
const tasks = requestedTasks.length ? suite.tasks.filter((task) => requestedTasks.includes(task.id)) : suite.tasks;
for (const model of models) if (!available.includes(model)) throw new Error(`model not visible: ${model}`);

const samples = [];
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  for (const task of tasks) for (const model of models) {
    const conditions = repetition % 2 ? ['standard', 'genos'] : ['genos', 'standard'];
    for (const condition of conditions) {
      const sample = execute(model, task, condition, repetition); samples.push(sample);
      console.log(`${model} ${task.id} r${repetition} ${condition}: ${sample.functional_score.toFixed(1)} (${sample.hidden_checks_passed}/${sample.hidden_checks_total})`);
    }
  }
}
const report = {
  schema_version: 1, benchmark: suite.suite, generated_at: new Date().toISOString(), source_revision: gitVersion('git', ['rev-parse', 'HEAD']),
  source_tree_dirty: run('git', ['status', '--porcelain']).stdout.trim().length > 0, codex_version: gitVersion('codex', ['--version']),
  models, tasks: tasks.map(({ id, difficulty }) => ({ id, difficulty })), repetitions, reasoning_effort: 'medium',
  environment: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model },
  controls: { identical_user_prompt: true, condition_order_alternates_by_repetition: true, fresh_workspace_per_run: true, hidden_grading_after_agent_exit: true },
  aggregate: { standard: aggregate(samples, 'standard'), genos: aggregate(samples, 'genos'), paired_effect: pairedBootstrap(samples) },
  samples,
  publication_gate: {
    publishable: repetitions >= 3 && models.length === available.length && tasks.length === suite.tasks.length
      && run('git', ['status', '--porcelain']).stdout.trim().length === 0
      && samples.every((sample) => sample.agent_exit_code === 0 && sample.hidden_checks_total > 0),
    requirements: ['at least 3 repetitions', 'all visible Codex models', 'all suite tasks', 'clean source tree', 'no failed agent process', 'non-empty hidden grader'],
  },
  limitations: ['Synthetic stateful tasks do not represent every software repository.', 'Publish a headline comparison only with at least 3 repetitions and the full visible model set.', 'Model inference is stochastic; raw traces and paired confidence intervals must accompany claims.'],
};
writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(runDir, 'samples.jsonl'), samples.map((row) => JSON.stringify(row)).join('\n') + '\n');
writeFileSync(path.join(resultsRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${path.relative(root, path.join(resultsRoot, 'latest.json'))}`);
