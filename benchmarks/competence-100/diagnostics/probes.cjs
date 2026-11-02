'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const agent = require('../agent.cjs');

const BASE = 'http://127.0.0.1:11434';
const MODEL = 'qwen2.5-coder:7b';
const F = 'op_dg_a17f';
const G = 'op_dg_8ca3';
const U = 'op_dg_7b02';
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const expression = (op, value) => ({ op, value });

function examples(op, options) {
  return options.inputs.map(x => ({ expression: expression(op, x), answer: options.a * x + options.b }));
}

function cases() {
  const negative = examples(F, { a: 3, b: 1, inputs: [-12, -11, -10] });
  const positive = examples(F, { a: 3, b: 1, inputs: [0, 1, 2] });
  const both = [...negative, ...examples(G, { a: 4, b: -4, inputs: [-12, -11, -10] })];
  const rules = { [F]: { a: 3, b: 1 }, [G]: { a: 4, b: -4 } };
  return [137, 239, 503, 877].flatMap(x => {
    const single = expression(F, x);
    const composition = expression(G, single);
    const unknown = expression(U, single);
    const variants = {
      single_negative_examples: { verifiedTrainingExamples: negative, expression: single },
      single_positive_examples: { verifiedTrainingExamples: positive, expression: single },
      single_json_rules: { verifiedRules: { [F]: rules[F] }, expression: single },
      single_text_rules: `Verified rule: ${F}(x) = 3*x + 1. Compute ${F}(${x}).`,
      composition_examples: { verifiedTrainingExamples: both, expression: composition },
      composition_json_rules: { verifiedRules: rules, expression: composition },
      composition_text_rules: `Verified rules: ${F}(x) = 3*x + 1 and ${G}(x) = 4*x - 4. Compute ${G}(${F}(${x})).`,
      unknown_single: { verifiedTrainingExamples: [], expression: expression(U, x) },
      unknown_mixed_examples: { verifiedTrainingExamples: negative, expression: unknown },
      unknown_mixed_rules: { verifiedRules: { [F]: rules[F] }, expression: unknown }
    };
    return Object.entries(variants).map(([condition, value]) => ({ condition, x,
      id: hash([condition, x]), prompt: typeof value === 'string' ? value : JSON.stringify(value),
      expected: expected(condition, x), missing: condition.startsWith('unknown') ? [U] : [] }));
  });
}

function expected(condition, x) {
  if (condition.startsWith('unknown')) return null;
  if (condition.startsWith('composition')) return (3 * x + 1) * 4 - 4;
  return 3 * x + 1;
}

function arithmeticCases() {
  return [137, 239, 503, 877].map(x => ({ condition: 'composition_expanded_arithmetic', x,
    id: hash(['composition_expanded_arithmetic', x]),
    prompt: `Compute (3*${x} + 1)*4 - 4.`, expected: 12 * x, missing: [] }));
}

function score(item, value) {
  if (!agent.validResponse(value)) return { valid: false, correct: false, highConfidence: null };
  const recognized = value.answer === null && value.abstain && item.missing.every(op => value.missing.includes(op));
  const correct = item.expected === null ? recognized : value.answer === item.expected && !value.abstain;
  return { valid: true, correct, highConfidence: value.confidence >= 0.8 };
}

async function request(item) {
  const response = await fetch(BASE + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: JSON.stringify({ model: MODEL, stream: false, format: 'json', keep_alive: '5m',
      options: { temperature: 0, seed: 17, num_ctx: 4096, num_predict: 128 },
      messages: [{ role: 'system', content: agent.INSTRUCTION
        + ' For this diagnostic, supplied verifiedRules are also authoritative evidence.' },
      { role: 'user', content: item.prompt }] })
  });
  if (!response.ok) throw Error('Ollama HTTP ' + response.status + ' ' + (await response.text()).slice(0, 500));
  const body = await response.json();
  let value = null;
  try { value = JSON.parse(body.message?.content); } catch (_) { /* Retain invalid responses. */ }
  return { raw: body.message?.content, model: body.model, value, inputTokens: body.prompt_eval_count,
    outputTokens: body.eval_count, doneReason: body.done_reason, score: score(item, value) };
}

function summarize(rows) {
  return Object.fromEntries([...new Set(rows.map(row => row.condition))].map(condition => {
    const group = rows.filter(row => row.condition === condition);
    return [condition, { assigned: group.length, valid: group.filter(row => row.result.score.valid).length,
      correct: group.filter(row => row.result.score.correct).length,
      highConfidenceErrors: group.filter(row => row.result.score.highConfidence && !row.result.score.correct).length }];
  }));
}

async function main() {
  const directory = process.argv[2];
  fs.mkdirSync(directory, { recursive: true });
  const response = await fetch(BASE + '/api/tags', { signal: AbortSignal.timeout(3000) });
  const model = (await response.json()).models.find(row => row.name === MODEL);
  if (model?.digest !== 'dae161e27b0e90dd1856c8bb3209201fd6736d8eb66298e75ed87571486f4364') throw Error('Diagnostic model mismatch');
  const selected = process.argv[3] === 'arithmetic' ? arithmeticCases() : cases();
  const plan = { schema: 'genos.competence-100.diagnostic-probes/v1', createdAt: new Date().toISOString(),
    analysis: 'posthoc-exploratory-fresh-tasks-not-confirmatory', model, endpoint: BASE,
    transportDifference: 'Repaired Ollama daemon, rather than original standalone Vulkan runtime.',
    maxCalls: selected.length, maxRequestMs: 30000, maxDurationMs: 300000, cases: selected };
  fs.writeFileSync(path.join(directory, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
  console.log('Diagnostic plan: ' + hash(plan));
  const start = Date.now();
  const rows = [];
  for (const item of plan.cases) {
    let result;
    try {
      if (Date.now() - start >= plan.maxDurationMs) throw Error('Diagnostic time budget exhausted');
      result = await request(item);
    } catch (error) { result = { error: error.message, score: { valid: false, correct: false, highConfidence: null } }; }
    const row = { ...item, result, at: new Date().toISOString() };
    fs.appendFileSync(path.join(directory, 'responses.jsonl'), JSON.stringify(row) + '\n');
    rows.push(row);
  }
  const report = { planHash: hash(plan), assigned: rows.length, elapsedMs: Date.now() - start,
    conditions: summarize(rows), limitation: 'Four items per condition; exploratory diagnostics with a different runtime, no general or confirmatory claim.' };
  fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { cases, score };
