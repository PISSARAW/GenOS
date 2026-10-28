'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { createRuntime } = require('../../../backend/src/services/cognitiveOmegaRuntimeService');

const ROOT = path.resolve(__dirname, '..');
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function transferOperation(operation, backend) {
  if (backend === 'json') return JSON.parse(JSON.stringify(operation));
  if (backend === 'portable') return JSON.parse(Buffer.from(JSON.stringify(operation), 'utf8').toString('utf8'));
  if (backend === 'tabular') {
    const fields = [operation.kind, operation.reference, operation.arguments.record_id, operation.arguments.limit];
    return { id: operation.id, kind: fields[0], reference: fields[1],
      arguments: { record_id: fields[2], limit: fields[3] } };
  }
  throw new Error(`unknown_transfer_backend:${backend}`);
}

function executeMissionTransfer(workload) {
  const operation = workload.operation;
  const firstResults = [];
  const violations = [];
  let transferCount = 0;
  let processedAgents = 0;
  for (let agentIndex = 0; agentIndex < workload.agents; agentIndex += 1) {
    let agentOkay = true;
    for (const backend of workload.backends) {
      const result = transferOperation(operation, backend);
      transferCount += 1;
      agentOkay = agentOkay && JSON.stringify(canonical(result)) === JSON.stringify(canonical(operation));
      if (agentIndex === 0) firstResults.push(result);
    }
    if (agentOkay) processedAgents += 1;
    else if (!violations.includes('portable_semantics_lost')) violations.push('portable_semantics_lost');
  }
  return { agent_count: workload.agents, processed_agents: processedAgents,
    transfer_count: transferCount, backend_results: firstResults,
    equivalent: processedAgents === workload.agents && violations.length === 0, violations };
}

async function execute(operation, authorized, workload = null) {
  let sideEffects = 0;
  const runtime = createRuntime();
  runtime.registerTool(operation.reference, async ({ arguments: args }) => {
    sideEffects += 1;
    return { value: args, mission_execution: workload ? executeMissionTransfer(workload) : null };
  });
  const result = await runtime.execute({ operations: [operation], policy: { call: authorized ? [operation.reference] : [] } });
  const response = { status: result.status === 'emitted' ? 'emitted' : 'blocked',
    ...(result.status === 'emitted' ? { value: result.values[operation.id].value }
      : { reason_class: operation.kind === 'CALL' ? 'unauthorized' : 'invalid_operation' }),
    side_effects: sideEffects };
  return { response, mission_execution: result.status === 'emitted'
    ? result.values[operation.id].mission_execution : null };
}

async function runCase(row) {
  const started = performance.now();
  const events = [];
  const record = (name) => events.push({ name, at_unix_ms: Date.now(),
    elapsed_ms: performance.now() - started });
  record('run_started');
  const operation = row.input.intent;
  const valid = await execute(operation, true, row.input.mission_workload);
  record('valid_operation_observed');
  const unauthorized = (await execute(operation, false)).response;
  record('unauthorized_operation_observed');
  const malformed = (await execute({ ...operation, kind: 'CALLX' }, true)).response;
  record('malformed_operation_observed');
  const output = { scenario_id: row.scenario_id, valid: valid.response,
    unauthorized, malformed, mission_execution: valid.mission_execution };
  record('mission_transfer_observed');
  record('run_completed');
  const canonicalInput = JSON.stringify(canonical(row.input));
  const canonicalResult = JSON.stringify(canonical(output));
  const trace = { schema: 'omega-bench-e12-trace/v1', backend: 'node_gcir_runtime',
    scenario_id: row.scenario_id, started_at_unix_ms: events[0].at_unix_ms,
    ended_at_unix_ms: events.at(-1).at_unix_ms,
    duration_ms: events.at(-1).elapsed_ms,
    input_sha256: crypto.createHash('sha256').update(canonicalInput).digest('hex'),
    result_sha256: crypto.createHash('sha256').update(canonicalResult).digest('hex'),
    status: 'completed', events };
  return { output, trace };
}

async function main() {
  const inputs = process.env.OMEGA_DATASET_INPUTS || path.join(ROOT, 'dataset/public/inputs');
  const rows = fs.readFileSync(path.join(inputs, 'E12.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const output = [];
  const traces = [];
  for (const row of rows) {
    const result = await runCase(row);
    output.push(result.output);
    traces.push(result.trace);
  }
  const resultsRoot = path.resolve(ROOT, 'results');
  const outputRoot = path.resolve(process.env.OMEGA_RESULTS_DIR || resultsRoot);
  if (!outputRoot.startsWith(`${resultsRoot}${path.sep}`) && outputRoot !== resultsRoot) {
    throw new Error('E12 output path must stay under public results/.');
  }
  const outputPath = path.join(outputRoot, 'E12-node.jsonl');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const tracePath = outputPath.replace(/\.jsonl$/, '.traces.jsonl');
  fs.writeFileSync(tracePath, `${traces.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = { backend: 'node_gcir_runtime', business_backend: true, cases: output.length,
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'dataset/manifest.json'))).digest('hex'),
    output_sha256: crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex'),
    trace_file: path.basename(tracePath), trace_records: traces.length,
    trace_sha256: crypto.createHash('sha256').update(fs.readFileSync(tracePath)).digest('hex') };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Node G-CIR runtime: ${output.length} cases -> ${path.relative(ROOT, outputPath)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
