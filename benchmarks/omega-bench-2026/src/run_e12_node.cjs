'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRuntime } = require('../../../backend/src/services/cognitiveOmegaRuntimeService');

const ROOT = path.resolve(__dirname, '..');
async function execute(operation, authorized) {
  let sideEffects = 0;
  const runtime = createRuntime();
  runtime.registerTool(operation.reference, async ({ arguments: args }) => {
    sideEffects += 1;
    return args;
  });
  const result = await runtime.execute({ operations: [operation], policy: { call: authorized ? [operation.reference] : [] } });
  return { status: result.status === 'emitted' ? 'emitted' : 'blocked',
    ...(result.status === 'emitted' ? { value: result.values[operation.id] }
      : { reason_class: operation.kind === 'CALL' ? 'unauthorized' : 'invalid_operation' }),
    side_effects: sideEffects };
}

async function runCase(row) {
  const operation = row.input.intent;
  return { scenario_id: row.scenario_id, valid: await execute(operation, true),
    unauthorized: await execute(operation, false),
    malformed: await execute({ ...operation, kind: 'CALLX' }, true) };
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
