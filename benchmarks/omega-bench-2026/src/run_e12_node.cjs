'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
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
  const operation = row.input.intent;
  const valid = await execute(operation, true, row.input.mission_workload);
  return { scenario_id: row.scenario_id, valid: valid.response,
    unauthorized: (await execute(operation, false)).response,
    malformed: (await execute({ ...operation, kind: 'CALLX' }, true)).response,
    mission_execution: valid.mission_execution };
}

async function main() {
  const rows = fs.readFileSync(path.join(ROOT, 'dataset/public/inputs/E12.jsonl'), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  const output = [];
  for (const row of rows) output.push(await runCase(row));
  const outputPath = path.join(ROOT, 'results/E12-node.jsonl');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${output.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const manifest = { backend: 'node_gcir_runtime', business_backend: true, cases: output.length,
    dataset_manifest_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'dataset/manifest.json'))).digest('hex'),
    output_sha256: crypto.createHash('sha256').update(fs.readFileSync(outputPath)).digest('hex') };
  fs.writeFileSync(outputPath.replace(/\.jsonl$/, '.manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Node G-CIR runtime: ${output.length} cases -> ${path.relative(ROOT, outputPath)}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
