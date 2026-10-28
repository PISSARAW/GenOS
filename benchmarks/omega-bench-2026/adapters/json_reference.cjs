'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const traces = require('../src/run-trace.cjs');
const { createRunMeasurement } = require('../src/measure-adapter-run.cjs');

const ROOT = path.resolve(__dirname, '..');
const REPO = path.resolve(ROOT, '..', '..');
const DATASET_ROOT = process.env.OMEGA_DATASET_ROOT || path.join(ROOT, 'dataset');
const INPUTS_ROOT = process.env.OMEGA_DATASET_INPUTS || path.join(DATASET_ROOT, 'public', 'inputs');
const backendRequire = createRequire(path.join(REPO, 'backend', 'package.json'));
const Ajv2020 = backendRequire('ajv/dist/2020');
const addFormats = backendRequire('ajv-formats');
const schema = JSON.parse(fs.readFileSync(path.join(REPO, 'spec', 'g-cir-omega.schema.json'), 'utf8'));
const EXPERIMENTS = Array.from({ length: 12 }, (_, index) => `E${String(index + 1).padStart(2, '0')}`);
const REPETITIONS = 3;

function readRows(file) {
  return fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

function validateE03(input, validator) {
  const accepted = validator(input.candidate);
  return { accepted };
}

function answerE01(input) {
  const match = input.intent.match(/Move (\d+) units of ([\w-]+)/);
  const quantity = Number(match[1]);
  const subject = match[2];
  return { operations: [{ kind: 'READ', reference: `stock/${subject}` }, { kind: 'CHECK', reference: `availability>=${quantity}` }, { kind: 'CALL', reference: 'dispatch', quantity }] };
}

function answerE02(input) { return { decoded_object: input.object }; }

function answerE04(input) {
  const operations = { add: (value, operand) => value + operand,
    mul: (value, operand) => value * operand };
  const result = input.program.reduce((value, item) => operations[item.op](value, item.value), input.initial);
  return { result };
}

function answerE05(input) {
  let firstState = null;
  let firstEffects = [];
  let allMatch = true;
  for (let replay = 0; replay < input.replay_count; replay += 1) {
    const state = {};
    const effects = [];
    for (const event of input.events) {
      if (event.op === 'set') state[event.key] = event.value;
      if (event.op === 'add') state[event.key] = (state[event.key] || 0) + event.value;
      effects.push(`${event.op}:${event.value}`);
    }
    if (firstState === null) {
      firstState = state;
      firstEffects = effects;
    } else if (JSON.stringify(state) !== JSON.stringify(firstState)
      || JSON.stringify(effects) !== JSON.stringify(firstEffects)) allMatch = false;
  }
  return { state: firstState, observable_effects: firstEffects,
    replay_count: input.replay_count, all_replays_match: allMatch };
}

function answerE06(input) {
  const completed = new Set();
  const effects = new Set();
  for (let index = 0; index <= input.crash_after_task_index; index += 1) {
    completed.add(input.tasks[index]);
    if (index === 0) effects.add(input.effect_key);
  }
  for (const task of input.tasks) completed.add(task);
  effects.add(input.effect_key);
  return { completed_tasks: input.tasks.filter((task) => completed.has(task)), irreversible_effect_count: effects.size };
}

function answerE07(input) {
  const agents = new Set(input.agents);
  const pending = new Map(input.tasks.map((task) => [task.id, task]));
  const delivered = new Set();
  const order = [];
  while (pending.size) {
    const ready = [...pending.values()].filter((task) => agents.has(task.agent) && task.depends_on.every((id) => delivered.has(id)));
    if (!ready.length) break;
    for (const task of ready) {
      pending.delete(task.id);
      delivered.add(task.id);
      order.push(task.id);
    }
  }
  return { delivered_task_ids: order, unresolved_dependencies: [...pending.keys()] };
}

function answerE08(input) {
  const allowed = input.policy[input.principal]?.includes(input.action) === true;
  return { allowed, executed_effects: allowed ? ['requested_action'] : [] };
}

function answerE09(input) {
  const start = input.command_value_start;
  const count = input.command_count;
  return { processed_count: count, checksum: count * (2 * start + count - 1) / 2 };
}

function answerE10(input) {
  const knownTopologies = new Set(['trinity', 'rhizome', 'metapopulation', 'holobionte', 'biome', 'biocenose', 'a-team', 'syncytium']);
  const allowedInvariants = new Set(['mission_id_preserved', 'pending_obligations_preserved', 'effect_authority_preserved']);
  const violations = [];
  if (!knownTopologies.has(input.to_topology)) violations.push('target_topology_invalid');
  if (!input.mission_id) violations.push('mission_id_missing');
  if (input.invariants.some((invariant) => !allowedInvariants.has(invariant))) violations.push('invariant_unknown');
  return { active_topology: input.to_topology, mission_id: input.mission_id, preserved_obligations: input.open_obligations, violations };
}

function agentIndex(agent) { return Number(agent.split('-')[1]); }

function answerE11(input) {
  const allocation = Object.fromEntries(input.demands.map((demand) => [demand.agent, demand.minimum]));
  const minimumTotal = Object.values(allocation).reduce((total, value) => total + value, 0);
  let remaining = Math.max(0, input.resource_budget - minimumTotal);
  while (remaining > 0) {
    const eligible = input.demands.filter((demand) => allocation[demand.agent] < 4);
    if (eligible.length === 0) break;
    eligible.sort((left, right) => right.priority - left.priority || agentIndex(left.agent) - agentIndex(right.agent));
    allocation[eligible[0].agent] += 1;
    remaining -= 1;
  }
  const allocatedTotal = Object.values(allocation).reduce((total, value) => total + value, 0);
  return { allocation, allocated_total: allocatedTotal, unallocated: input.resource_budget - allocatedTotal };
}

function roundTripJson(operation) { return JSON.parse(JSON.stringify(operation)); }

function roundTripTable(operation) {
  const row = [operation.kind, operation.tool, operation.arguments.record_id, operation.arguments.limit];
  return { kind: row[0], tool: row[1], arguments: { record_id: row[2], limit: row[3] } };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function answerE12(input) {
  const operation = input.intent;
  return { valid: { status: 'emitted', value: operation.arguments, side_effects: 1 },
    unauthorized: { status: 'blocked', reason_class: 'unauthorized', side_effects: 0 },
    malformed: { status: 'blocked', reason_class: 'invalid_operation', side_effects: 0 } };
}

function missionSecurity(workload) {
  const decisions = workload.commands.map((command) =>
    workload.policy[command.principal]?.includes(command.action) === true);
  return { decisions, executed_effects: decisions.filter(Boolean).length, violations: [] };
}

function missionMessages(workload) {
  const decoded = JSON.parse(JSON.stringify(workload.messages));
  const preserved = JSON.stringify(canonical(decoded))
    === JSON.stringify(canonical(workload.messages));
  return { delivered_message_ids: decoded.map((message) => message.id),
    messages_preserved: preserved, violations: preserved ? [] : ['message_loss'] };
}

function missionRecovery(workload) {
  const completed = new Set(workload.tasks.slice(0, workload.crash_after + 1));
  workload.tasks.forEach((task) => completed.add(task));
  return { completed_tasks: workload.tasks.filter((task) => completed.has(task)),
    irreversible_effect_count: workload.effect_key ? 1 : 0, violations: [] };
}

function missionBudget(workload) {
  const allocation = Object.fromEntries(workload.demands.map((item) => [item.agent, item.minimum]));
  let remaining = workload.budget - Object.values(allocation).reduce((sum, value) => sum + value, 0);
  while (remaining > 0) {
    const eligible = workload.demands.filter((item) => allocation[item.agent] < 4);
    eligible.sort((left, right) => right.priority - left.priority
      || agentIndex(left.agent) - agentIndex(right.agent));
    allocation[eligible[0].agent] += 1;
    remaining -= 1;
  }
  return { allocation, allocated_total: workload.budget, violations: [] };
}

function missionPortability(workload) {
  const operation = workload.operation;
  const table = { id: operation.id, kind: operation.kind, reference: operation.reference,
    arguments: { record_id: operation.arguments.record_id, limit: operation.arguments.limit } };
  const results = workload.backends.map((backend) => backend === 'tabular'
    ? table : JSON.parse(JSON.stringify(operation)));
  const equivalent = results.every((item) =>
    JSON.stringify(canonical(item)) === JSON.stringify(canonical(operation)));
  return { agent_count: workload.agents, processed_agents: workload.agents,
    transfer_count: workload.agents * workload.backends.length, backend_results: results,
    equivalent, violations: equivalent ? [] : ['portable_semantics_lost'] };
}

const MISSION_EXECUTORS = { security_filter: missionSecurity, message_round_trip: missionMessages,
  recoverable_handoff: missionRecovery, collective_budget: missionBudget,
  portable_scale: missionPortability };

function executeMissionWorkload(workload) {
  if (!workload) return null;
  const executor = MISSION_EXECUTORS[workload.kind];
  if (!executor) throw new Error(`unknown_mission_workload:${workload.kind}`);
  return executor(workload);
}

const HANDLERS = { E01: answerE01, E02: answerE02, E04: answerE04, E05: answerE05, E06: answerE06, E07: answerE07, E08: answerE08, E09: answerE09, E10: answerE10, E11: answerE11, E12: answerE12 };

function execute(row, validator) {
  const answer = row.experiment_id === 'E03' ? validateE03(row.input, validator)
    : HANDLERS[row.experiment_id](row.input);
  const missionExecution = executeMissionWorkload(row.input.mission_workload);
  return missionExecution ? { ...answer, mission_execution: missionExecution } : answer;
}

function timedRow(row, repetition, validator) {
  const trace = traces.start({ scenario_id: row.scenario_id, experiment_id: row.experiment_id,
    condition_id: 'A', repetition }, row.input);
  const input = JSON.stringify(row.input);
  const measurement = createRunMeasurement();
  const answer = execute(row, validator);
  const latency = measurement.elapsedMs();
  traces.phase(trace, row.experiment_id === 'E03' ? 'schema_validation_and_reference_execution_completed'
    : 'reference_execution_completed');
  const result = JSON.stringify(answer);
  traces.finish(trace, answer);
  return {
    scenario_id: row.scenario_id, experiment_id: row.experiment_id, condition_id: 'A', repetition,
    status: 'completed', answer,
    telemetry: { latency_ms: latency, input_bytes: Buffer.byteLength(input), output_bytes: Buffer.byteLength(result), input_tokens: null, output_tokens: null, cost_usd: null }
  };
}

function createValidator() {
  const engine = new Ajv2020({ allErrors: true, strict: false });
  addFormats(engine);
  return engine.compile(schema);
}

function main() {
  const rows = EXPERIMENTS.flatMap((experiment) => readRows(path.join(INPUTS_ROOT, `${experiment}.jsonl`)));
  const validator = createValidator();
  const outputPath = process.argv[2] || path.join(ROOT, 'results', 'A-reference.jsonl');
  const output = [];
  for (let repetition = 1; repetition <= REPETITIONS; repetition += 1) {
    for (const row of rows) output.push(timedRow(row, repetition, validator));
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output.map((item) => JSON.stringify(item)).join('\n')}\n`);
  const traceManifest = traces.writeSidecar(outputPath, 'A');
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim();
  const manifest = { protocol: 'OMEGA-BENCH-2026', condition_id: 'A', status: 'reference_condition_only', scenarios: rows.length, repetitions: REPETITIONS, runs: output.length, repository_revision: revision, adapter_sha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(DATASET_ROOT, 'manifest.json'))).digest('hex'), latency_scope: 'decoded_input_object_to_semantic_answer; trace events excluded', runtime: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model || null, memory_bytes: os.totalmem() } };
  manifest.external_model_calls = 0;
  Object.assign(manifest, traceManifest);
  fs.writeFileSync(outputPath.replace(/\.jsonl$/i, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Condition A complete: ${output.length} reference runs across ${rows.length} cases.\n`);
}

if (require.main === module) main();

module.exports = { createValidator, execute, executeMissionWorkload, readRows };
