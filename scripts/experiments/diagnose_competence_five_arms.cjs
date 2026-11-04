'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const llm = require('../../benchmarks/competence-five-arms/llm.cjs');
const protocol = require('../../benchmarks/competence-five-arms/protocol.json');
const { hash } = require('../../benchmarks/competence-five-arms/corpus.cjs');
const methods = require('../../benchmarks/competence-five-arms/methods.cjs');
const CASES = [{ op: 'op_d1a00001', a: 2, b: 1, x: 137 }, { op: 'op_d1a00002', a: 3, b: -2, x: 173 }];
const CONDITIONS = ['json_examples', 'prose_examples', 'explicit_rule', 'arithmetic'];

function messages(input) {
  const samples = [-2, -1, 0, 1, 2, 7].map((x, i) => ({ step: i + 1, op: input.op,
    epoch: 0, x, y: input.a * x + input.b }));
  const payload = { query: { expression: { op: input.op, value: input.x }, epochs: {} }, observations: samples };
  let system = llm.INSTRUCTION;
  let content = JSON.stringify(payload);
  if (input.condition === 'prose_examples') content = `Operator ${input.op}, epoch 0. Verified measurements: `
    + samples.map(row => `f(${row.x})=${row.y}`).join('; ') + `. Query: f(${input.x}).`;
  if (input.condition === 'explicit_rule') content = JSON.stringify({ ...payload,
    verifiedRule: `${input.op} is exactly y=${input.a}*x+(${input.b})` });
  if (input.condition === 'arithmetic') {
    system = 'Calculate the exact integer. Return only JSON with answer, confidence, abstain=false, reason="answerable", missing=[].';
    content = `Compute ${input.a}*${input.x}+(${input.b}).`;
  }
  return [{ role: 'system', content: system }, { role: 'user', content }];
}

async function infer(input) {
  const started = Date.now();
  try {
    const response = await fetch('http://127.0.0.1:11434/api/chat', { method: 'POST',
      headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(45000),
      body: JSON.stringify({ model: protocol.model, stream: false, format: 'json',
        options: { temperature: 0, seed: input.seed, num_predict: 128, num_ctx: 8192 }, messages: input.messages }) });
    if (!response.ok) throw Error('HTTP ' + response.status);
    const body = await response.json();
    let value = null;
    try { value = JSON.parse(body.message?.content); } catch (_) { /* Preserve invalid output. */ }
    return { raw: body.message?.content, value, valid: methods.valid(value), model: body.model,
      inputTokens: body.prompt_eval_count, outputTokens: body.eval_count,
      doneReason: body.done_reason, elapsedMs: Date.now() - started };
  } catch (error) { return { valid: false, value: null, error: error.message, elapsedMs: Date.now() - started }; }
}

async function main() {
  const directory = path.join('D:/genos-competence-results/five-arm-diagnostics', crypto.randomUUID());
  fs.mkdirSync(directory, { recursive: true });
  const trials = CASES.flatMap((item, i) => CONDITIONS.map(condition => ({ ...item, condition,
    expected: item.a * item.x + item.b, seed: 177 + i, messages: messages({ ...item, condition }) })));
  const manifest = { schema: 'genos.competence-five-arms.diagnostic/v1', model: await llm.describe(),
    scriptHash: hash(fs.readFileSync(__filename, 'utf8')), trials, createdAt: new Date().toISOString(),
    limitation: 'Post-hoc diagnostic, two fresh cases; not a replication or replacement of the registered campaign. Arithmetic condition changes the system instruction too.' };
  fs.writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Diagnostic: ${directory}\nManifest: ${hash(manifest)}`);
  const rows = [];
  for (const trial of trials) {
    const response = await infer(trial);
    const correct = response.valid && !response.value.abstain && response.value.answer === trial.expected;
    const row = { ...trial, response, correct, numericFieldCorrect: response.value?.answer === trial.expected };
    rows.push(row);
    fs.appendFileSync(path.join(directory, 'responses.jsonl'), JSON.stringify(row) + '\n');
  }
  const after = await llm.describe();
  const report = { calls: rows.length, modelUnchanged: manifest.model.digest === after.digest,
    conditions: CONDITIONS.map(condition => ({ condition, trials: rows.filter(row => row.condition === condition).length,
      correct: rows.filter(row => row.condition === condition && row.correct).length,
      numericFieldCorrect: rows.filter(row => row.condition === condition && row.numericFieldCorrect).length })),
    limitation: manifest.limitation };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { messages, infer };
