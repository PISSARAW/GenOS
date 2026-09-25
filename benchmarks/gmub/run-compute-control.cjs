'use strict';
// Phase 2 — contrôle compute naïf: N samples + majority vote, sans GenOS.
// Usage: node run-compute-control.cjs --model m --cases cases.json --out results.json [--n 5] [--timeout_ms 180000]
const fs = require('fs');
const path = require('path');
const mp = require('../../backend/src/services/modelProvider');

function parseArgs(argv) {
  const cfg = { model: null, cases: null, out: null, n: 5, seed: 42, timeoutMs: 180000 };
  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i] === '--model') cfg.model = argv[i + 1];
    if (argv[i] === '--cases') cfg.cases = argv[i + 1];
    if (argv[i] === '--out') cfg.out = argv[i + 1];
    if (argv[i] === '--n') cfg.n = Number(argv[i + 1]);
    if (argv[i] === '--seed') cfg.seed = Number(argv[i + 1]);
    if (argv[i] === '--timeout_ms') cfg.timeoutMs = Number(argv[i + 1]);
  }
  return cfg;
}

function extractAnswer(raw) {
  try {
    const obj = JSON.parse(raw);
    if (typeof obj === 'object' && obj !== null && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (keys.length === 1) {
        const v = obj[keys[0]];
        return String(v).trim();
      }
      return JSON.stringify(obj);
    }
    return String(obj).trim();
  } catch (_) {
    return raw.trim();
  }
}

function normalizeAnswer(answer) {
  // Normalize numeric answers: "5", "5 cents", "5.0" → "5"
  let a = answer.toLowerCase().trim();
  // Remove trailing units
  a = a.replace(/\s*(cents?|hours?|minutes?|seconds?|%|percent|dollars?|usd)\s*$/, '');
  // Try numeric
  const n = parseFloat(a);
  if (!Number.isNaN(n)) {
    // Integer if close enough
    if (Math.abs(n - Math.round(n)) < 0.001) return String(Math.round(n));
    return String(n);
  }
  return a;
}

function majorityVote(answers) {
  const counts = new Map();
  for (const a of answers) {
    const norm = normalizeAnswer(a);
    counts.set(norm, (counts.get(norm) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [ans, count] of counts) {
    if (count > bestCount || (count === bestCount && best === null)) {
      best = ans;
      bestCount = count;
    }
  }
  return { answer: best, votes: bestCount, total: answers.length, distribution: Object.fromEntries(counts) };
}

function scoreCase(answer, expected, pattern) {
  if (pattern) {
    try { return new RegExp(pattern, 'i').test(answer); } catch (_) { return false; }
  }
  const a = normalizeAnswer(answer);
  const e = normalizeAnswer(expected);
  if (a === e) return true;
  const an = parseFloat(a);
  const en = parseFloat(e);
  if (!Number.isNaN(an) && !Number.isNaN(en) && an === en) return true;
  return false;
}

async function runWithRetry({ model, prompt, seed, timeoutMs, maxRetries }) {
  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await mp.generate({
        model,
        prompt,
        maxTokens: 256,
        seed: seed + attempt,
        stream: false,
        timeoutMs
      });
      return { text: result.text || '', servedModel: result.servedModel || result.model || null, inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0, attempts: attempt + 1 };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) continue;
    }
  }
  throw lastError;
}

async function collectSamples(cfg, testCase) {
  const totals = { samples: [], servedModels: new Set(), inputTokens: 0, outputTokens: 0, attempts: 0 };
  for (let index = 0; index < cfg.n; index += 1) {
    const result = await runWithRetry({ model: cfg.model, prompt: testCase.prompt,
      seed: cfg.seed + index, timeoutMs: cfg.timeoutMs, maxRetries: 1 });
    totals.samples.push(extractAnswer(result.text));
    if (result.servedModel) totals.servedModels.add(result.servedModel);
    totals.inputTokens += result.inputTokens;
    totals.outputTokens += result.outputTokens;
    totals.attempts += result.attempts;
  }
  return totals;
}

async function runCase(cfg, testCase) {
  const startedAt = Date.now();
  process.stderr.write(`Running ${cfg.model} x${cfg.n} on ${testCase.id}... `);
  try {
    const totals = await collectSamples(cfg, testCase);
    const vote = majorityVote(totals.samples);
    const passed = scoreCase(vote.answer, testCase.expected, testCase.pattern);
    process.stderr.write(`${passed ? 'PASS' : 'FAIL'} (${vote.votes}/${vote.total} votes)\n`);
    return resultForCase({ cfg, testCase, totals, vote, passed, startedAt });
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    return { model: cfg.model, requestedModel: cfg.model, servedModel: null, case_id: testCase.id,
      domain: testCase.domain, mode: 'compute_control', passed: false, error: error.message, seed: cfg.seed };
  }
}

function resultForCase(input) {
  const { cfg, testCase, totals, vote, passed, startedAt } = input;
  return { model: cfg.model, requestedModel: cfg.model,
    servedModel: totals.servedModels.size === 1 ? [...totals.servedModels][0] : null,
    servedModels: [...totals.servedModels], case_id: testCase.id, domain: testCase.domain,
    mode: 'compute_control', samples: totals.samples.slice(0, 10), answer: vote.answer,
    expected: testCase.expected, passed, votes: vote.votes, total: vote.total,
    distribution: vote.distribution, inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens, totalAttempts: totals.attempts,
    latencyMs: Date.now() - startedAt, costUsd: null, seed: cfg.seed };
}

async function main() {
  const cfg = parseArgs(process.argv);
  if (!cfg.model || !cfg.cases || !cfg.out) {
    console.error('Usage: node run-compute-control.cjs --model m --cases cases.json --out results.json [--n 5] [--seed 42] [--timeout_ms 180000]');
    process.exit(1);
  }
  const cases = JSON.parse(fs.readFileSync(path.resolve(cfg.cases), 'utf8'));
  const results = [];
  for (const testCase of cases.cases) results.push(await runCase(cfg, testCase));
  const outPath = path.resolve(cfg.out);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.passed).length;
  const totalTokens = results.reduce((s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0), 0);
  console.log(`Done: ${passed}/${results.length} passed, ${totalTokens} total tokens. Results: ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
