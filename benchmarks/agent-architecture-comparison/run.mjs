#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { orchestrationFinished } from './support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const taskRoot = path.resolve(here, '../genos-agentbench');
const suite = JSON.parse(readFileSync(path.join(taskRoot, 'suite.json'), 'utf8'));
const resultsRoot = path.join(here, 'results');
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.join(resultsRoot, 'runs', runId);
const schema = path.join(taskRoot, 'response.schema.json');
const mcpBinary = path.join(root, 'target/debug/genos-mcp');
const genosBinary = path.join(root, 'target/debug/genos');
const bridge = path.join(root, 'backend/bin/genos-orchestrate.cjs');

function option(name, fallback) {
  const direct = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const model = option('--model', 'gpt-5.6-terra');
const repetitions = Number.parseInt(option('--repetitions', '1'), 10);
const selectedTaskIds = option('--tasks', '').split(',').filter(Boolean);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('repetitions must be 1..10');
const tasks = selectedTaskIds.length ? suite.tasks.filter((task) => selectedTaskIds.includes(task.id)) : suite.tasks;
if (!tasks.length) throw new Error('No benchmark task selected.');

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
}
function sleep(milliseconds) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds); }
function parseEvents(text = '') {
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
}
function parseTap(text = '') {
  const pass = Number(text.match(/^# pass (\d+)$/m)?.[1] ?? 0);
  const fail = Number(text.match(/^# fail (\d+)$/m)?.[1] ?? 0);
  return { pass, fail, total: pass + fail, score: pass + fail ? 100 * pass / (pass + fail) : 0 };
}
function usage(value = {}) {
  const inputTokens = Number(value.input_tokens ?? value.inputTokens ?? 0);
  const outputTokens = Number(value.output_tokens ?? value.outputTokens ?? 0);
  const cachedInputTokens = Number(value.cached_input_tokens ?? value.cachedInputTokens ?? 0);
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cached_input_tokens: cachedInputTokens,
    total_tokens: inputTokens + outputTokens,
    billable_tokens: Math.max(0, inputTokens - cachedInputTokens) + outputTokens
  };
}
function addUsage(left, right) {
  return Object.fromEntries(['input_tokens', 'output_tokens', 'cached_input_tokens', 'total_tokens', 'billable_tokens']
    .map((key) => [key, Number(left?.[key] || 0) + Number(right?.[key] || 0)]));
}
function protectedDigest(workspace) {
  const hash = createHash('sha256');
  for (const name of ['task.md', 'public.test.mjs']) hash.update(name).update(readFileSync(path.join(workspace, name)));
  return hash.digest('hex');
}
function grade(task, workspace, caseDir) {
  const grader = run('node', ['--test', path.join(taskRoot, task.grader)], {
    cwd: workspace, env: { ...process.env, TARGET_DIR: workspace }, timeout: task.max_seconds * 1000
  });
  writeFileSync(path.join(caseDir, 'grader.tap'), `${grader.stdout || ''}${grader.stderr || ''}`);
  return { ...parseTap(grader.stdout), exit_code: grader.status };
}
function directPrompt(condition) {
  const base = 'Read task.md and repair the implementation. Preserve the public API. Do not edit task.md or public.test.mjs. Run the public test and add focused tests if useful. Do not access files outside this workspace.';
  if (condition === 'simple') return `${base}\nImplement the best solution you can and return the requested JSON summary.`;
  return `${base}\nBefore editing, form at least three falsifiable hypotheses. Check the implementation and tests against each hypothesis, reject weak alternatives, then implement the smallest complete repair. Re-run tests after the patch and inspect the final diff before returning the requested JSON summary.`;
}
function executeDirect(modelName, task, condition, repetition) {
  const caseDir = path.join(runDir, `${task.id}__r${repetition}__${condition}`);
  const workspace = path.join(caseDir, 'workspace');
  mkdirSync(caseDir, { recursive: true });
  cpSync(path.join(taskRoot, 'tasks', task.id), workspace, { recursive: true });
  const before = protectedDigest(workspace);
  const response = path.join(caseDir, 'response.json');
  const effort = condition === 'boosted' ? 'high' : 'medium';
  const args = ['exec', '--ignore-user-config', '--ephemeral', '--json', '--color', 'never', '--skip-git-repo-check',
    '--sandbox', 'workspace-write', '--model', modelName, '-c', `model_reasoning_effort=${JSON.stringify(effort)}`,
    '--cd', workspace, '--output-schema', schema, '--output-last-message', response, directPrompt(condition)];
  const started = performance.now();
  const agent = run('codex', args, { timeout: task.max_seconds * 1000 });
  const durationMs = Math.round(performance.now() - started);
  writeFileSync(path.join(caseDir, 'events.jsonl'), agent.stdout || '');
  writeFileSync(path.join(caseDir, 'stderr.log'), agent.stderr || '');
  const events = parseEvents(agent.stdout);
  const turn = events.findLast((event) => event.type === 'turn.completed');
  const result = grade(task, workspace, caseDir);
  return {
    model: modelName, task_id: task.id, repetition, condition, reasoning_effort: effort,
    agent_exit_code: agent.status, functional_score: result.score, hidden_checks_passed: result.pass,
    hidden_checks_total: result.total, grader_exit_code: result.exit_code,
    protected_files_intact: before === protectedDigest(workspace), duration_ms: durationMs,
    token_usage: { codex: usage(turn?.usage), local_models: usage(), total: usage(turn?.usage), accounting_complete: true },
    worker_failures: 0, orchestration_completed: null, artifacts: path.relative(root, caseDir)
  };
}

function sqliteJson(database, sql) {
  const result = run('sqlite3', ['-json', database, sql]);
  if (result.status !== 0 || !result.stdout.trim()) return [];
  try { return JSON.parse(result.stdout); } catch { return []; }
}
function mcpAcceptance(workspace, database, capsuleRoot, task, mission, allowedCommands) {
  const messages = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'agent-architecture-benchmark', version: '1' } } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'genos_orchestrate', arguments: {
      task: mission, allowed_commands: allowedCommands, allow_file_edits: true, silent_updates: true,
      autonomous_orchestration: true
    } } }
  ];
  const environment = {
    ...process.env,
    GENOS_WORKSPACE_ROOT: workspace,
    GENOS_CAPSULE_ROOT: capsuleRoot,
    GENOS_DB_PATH: database,
    GENOS_BIN: genosBinary,
    GENOS_ORCHESTRATOR_BRIDGE: bridge,
    GENOS_CODEX_MODEL: model,
    GENOS_CODEX_REASONING_EFFORT: 'medium',
    GENOS_ALLOWED_COMMANDS_JSON: JSON.stringify(allowedCommands),
    GENOS_ALLOW_FILE_EDITS: 'true',
    GENOS_SILENT_UPDATES: 'true'
  };
  const call = run(mcpBinary, ['stdio'], {
    cwd: workspace, env: environment, input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`, timeout: 120_000
  });
  const response = parseEvents(call.stdout).find((event) => event.id === 2);
  const output = response?.result?.structuredContent?.output ?? response?.result?.structured_content?.output;
  if (call.status !== 0 || !output?.orchestratorId) throw new Error(call.stderr || 'GenOS MCP did not accept the benchmark mission.');
  return { orchestratorId: output.orchestratorId, stdout: call.stdout, stderr: call.stderr };
}
function waitForOrchestrator(database, orchestratorId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const agents = sqliteJson(database, `SELECT id,name,status,parent_agent_id,current_task FROM agents WHERE id='${orchestratorId}' OR parent_agent_id='${orchestratorId}' ORDER BY rowid`);
    const rootEvents = sqliteJson(database, `SELECT event_type FROM telemetry_events WHERE agent_id='${orchestratorId}' AND event_type IN ('AGENT_COMPLETED','AGENT_FAILED','AGENT_HALTED','AGENT_RUNTIME_ERROR') ORDER BY id`).map((event) => event.event_type);
    if (orchestrationFinished(agents, rootEvents)) return { agents, timedOut: false };
    sleep(500);
  }
  const agents = sqliteJson(database, `SELECT id,name,status,parent_agent_id,current_task FROM agents WHERE id='${orchestratorId}' OR parent_agent_id='${orchestratorId}' ORDER BY rowid`);
  return { agents, timedOut: true };
}
function genosUsage(database, orchestratorId) {
  const runs = sqliteJson(database, `SELECT agent_id,status,metrics_json FROM strategy_execution_runs WHERE agent_id='${orchestratorId}' OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id='${orchestratorId}')`);
  let codex = usage();
  for (const row of runs) {
    let metrics = {}; try { metrics = JSON.parse(row.metrics_json || '{}'); } catch {}
    codex = addUsage(codex, usage(metrics));
  }
  const reviews = sqliteJson(database, `SELECT payload_json FROM telemetry_events WHERE agent_id='${orchestratorId}' AND event_type='LOCAL_MODEL_ROUTING'`);
  let localModels = usage();
  for (const row of reviews) {
    let payload = {}; try { payload = JSON.parse(row.payload_json || '{}'); } catch {}
    localModels = addUsage(localModels, usage(payload.usage));
  }
  return { codex, local_models: localModels, total: addUsage(codex, localModels), accounting_complete: reviews.every((row) => JSON.parse(row.payload_json || '{}').consulted !== true || JSON.parse(row.payload_json || '{}').usage) };
}
function executeGenos(task, repetition) {
  const condition = 'genos';
  const caseDir = path.join(runDir, `${task.id}__r${repetition}__${condition}`);
  const workspace = path.join(caseDir, 'workspace');
  const capsuleRoot = path.join(caseDir, 'capsules');
  const database = path.join(caseDir, 'genos.db');
  mkdirSync(caseDir, { recursive: true });
  cpSync(path.join(taskRoot, 'tasks', task.id), workspace, { recursive: true });
  const before = protectedDigest(workspace);
  const implementationFiles = ['ledger.mjs', 'scheduler.mjs', 'rollout.mjs'];
  const allowedCommands = ['node --test public.test.mjs', "sed -n '1,320p' task.md", "sed -n '1,320p' public.test.mjs",
    ...implementationFiles.map((file) => `sed -n '1,360p' ${file}`)];
  const mission = `Read task.md and repair the implementation in this isolated workspace. The implementation file for this task is ${implementationFiles.find((file) => existsSync(path.join(workspace, file)))}. Preserve the public API and never edit task.md or public.test.mjs. Use only the explicitly authorized read and test commands. Run node --test public.test.mjs after editing. Coordinate bounded workers only when their independent evidence is useful. The final orchestrator workspace, not an unmerged worker branch, must contain the verified implementation.`;
  const started = performance.now();
  const accepted = mcpAcceptance(workspace, database, capsuleRoot, task, mission, allowedCommands);
  writeFileSync(path.join(caseDir, 'mcp.jsonl'), accepted.stdout);
  writeFileSync(path.join(caseDir, 'mcp.stderr.log'), accepted.stderr || '');
  const { agents, timedOut } = waitForOrchestrator(database, accepted.orchestratorId, task.max_seconds * 2 * 1000);
  const durationMs = Math.round(performance.now() - started);
  const finalWorkspace = path.join(capsuleRoot, path.basename(workspace), accepted.orchestratorId);
  const result = grade(task, finalWorkspace, caseDir);
  const telemetry = sqliteJson(database, `SELECT event_type,action,detail,payload_json,severity,created_at FROM telemetry_events WHERE agent_id='${accepted.orchestratorId}' OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id='${accepted.orchestratorId}') ORDER BY id`);
  writeFileSync(path.join(caseDir, 'orchestration.json'), `${JSON.stringify({ orchestrator_id: accepted.orchestratorId, agents, telemetry }, null, 2)}\n`);
  return {
    model, task_id: task.id, repetition, condition, reasoning_effort: 'medium', agent_exit_code: agents.every((agent) => agent.status === 'idle') ? 0 : 1,
    functional_score: result.score, hidden_checks_passed: result.pass, hidden_checks_total: result.total,
    grader_exit_code: result.exit_code, protected_files_intact: before === protectedDigest(workspace), duration_ms: durationMs,
    token_usage: genosUsage(database, accepted.orchestratorId), worker_failures: agents.filter((agent) => agent.parent_agent_id && agent.status !== 'idle').length,
    orchestration_completed: !timedOut && agents.every((agent) => agent.status === 'idle'), timed_out: timedOut,
    orchestrator_id: accepted.orchestratorId,
    artifacts: path.relative(root, caseDir)
  };
}
function aggregate(samples, condition) {
  const rows = samples.filter((sample) => sample.condition === condition);
  const tokens = rows.reduce((total, row) => addUsage(total, row.token_usage.total), usage());
  return {
    runs: rows.length,
    mean_functional_score: rows.reduce((sum, row) => sum + row.functional_score, 0) / rows.length,
    perfect_run_rate: rows.filter((row) => row.functional_score === 100).length / rows.length,
    mean_duration_ms: rows.reduce((sum, row) => sum + row.duration_ms, 0) / rows.length,
    token_usage: tokens,
    worker_failures: rows.reduce((sum, row) => sum + row.worker_failures, 0),
    timed_out_runs: rows.filter((row) => row.timed_out === true).length,
    accounting_complete: rows.every((row) => row.token_usage.accounting_complete)
  };
}

mkdirSync(runDir, { recursive: true });
const build = run('cargo', ['build', '--quiet', '-p', 'genos-mcp', '-p', 'genos-cli']);
if (build.status !== 0) throw new Error(build.stderr || 'Unable to build GenOS binaries.');
const visible = run('codex', ['debug', 'models']);
if (visible.status !== 0 || !visible.stdout.includes(model)) throw new Error(`Codex model is not visible: ${model}`);
const samples = [];
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  for (const task of tasks) {
    for (const condition of ['simple', 'boosted', 'genos']) {
      const sample = condition === 'genos' ? executeGenos(task, repetition) : executeDirect(model, task, condition, repetition);
      samples.push(sample);
      writeFileSync(path.join(runDir, 'samples.partial.jsonl'), `${samples.map((row) => JSON.stringify(row)).join('\n')}\n`);
      console.log(`${task.id} r${repetition} ${condition}: ${sample.functional_score.toFixed(1)} tokens=${sample.token_usage.total.total_tokens} duration=${sample.duration_ms}ms`);
    }
  }
}
const report = {
  schema_version: 1,
  benchmark: 'agent-architecture-comparison-v1',
  generated_at: new Date().toISOString(),
  source_revision: run('git', ['rev-parse', 'HEAD']).stdout.trim(),
  source_tree_dirty: run('git', ['status', '--porcelain']).stdout.trim().length > 0,
  codex_version: run('codex', ['--version']).stdout.trim(), model, repetitions,
  tasks: tasks.map(({ id, difficulty }) => ({ id, difficulty })),
  controls: { same_model: true, fresh_workspace_per_run: true, hidden_grading_after_exit: true, genos_started_via_public_mcp: true },
  conditions: {
    simple: 'One Codex agent, medium reasoning, minimal outcome prompt.',
    boosted: 'One Codex agent, high reasoning, explicit hypothesis and verification prompt, no GenOS.',
    genos: 'GenOS orchestrator invoked through public genos_orchestrate MCP, medium reasoning, bounded workers.'
  },
  aggregate: Object.fromEntries(['simple', 'boosted', 'genos'].map((condition) => [condition, aggregate(samples, condition)])),
  samples,
  publication_gate: { publishable: repetitions >= 3 && samples.every((sample) => sample.hidden_checks_total === 8 && sample.token_usage.accounting_complete && sample.timed_out !== true), requirements: ['at least three repetitions', 'all hidden graders present', 'complete all-model token accounting', 'no timed-out run'] },
  limitations: ['Three synthetic stateful tasks do not represent every repository.', 'Boosted intentionally spends more direct-model reasoning than simple.', 'A one-repetition pilot validates the protocol but cannot establish superiority.']
};
writeFileSync(path.join(runDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(path.join(runDir, 'samples.jsonl'), `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`);
mkdirSync(resultsRoot, { recursive: true });
writeFileSync(path.join(resultsRoot, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`report: ${path.relative(root, path.join(resultsRoot, 'latest.json'))}`);
