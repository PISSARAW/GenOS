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
      return { text: result.text || '', inputTokens: result.inputTokens || 0, outputTokens: result.outputTokens || 0, attempts: attempt + 1 };
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) continue;
    }
  }
  throw lastError;
}

async function main() {
  const cfg = parseArgs(process.argv);
  if (!cfg.model || !cfg.cases || !cfg.out) {
    console.error('Usage: node run-compute-control.cjs --model m --cases cases.json --out results.json [--n 5] [--seed 42] [--timeout_ms 180000]');
    process.exit(1);
  }
  const cases = JSON.parse(fs.readFileSync(path.resolve(cfg.cases), 'utf8'));
  const results = [];
  for (const c of cases.cases) {
    process.stderr.write(`Running ${cfg.model} x${cfg.n} on ${c.id}... `);
    try {
      const samples = [];
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalAttempts = 0;
      for (let i = 0; i < cfg.n; i++) {
        const r = await runWithRetry({ model: cfg.model, prompt: c.prompt, seed: cfg.seed + i, timeoutMs: cfg.timeoutMs, maxRetries: 1 });
        samples.push(extractAnswer(r.text));
        totalInputTokens += r.inputTokens;
        totalOutputTokens += r.outputTokens;
        totalAttempts += r.attempts;
      }
      const vote = majorityVote(samples);
      const passed = scoreCase(vote.answer, c.expected, c.pattern);
      results.push({
        model: cfg.model,
        case_id: c.id,
        domain: c.domain,
        mode: 'compute_control',
        samples: samples.slice(0, 10),
        answer: vote.answer,
        expected: c.expected,
        passed,
        votes: vote.votes,
        total: vote.total,
        distribution: vote.distribution,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        totalAttempts,
        latencyMs: 0,
        costUsd: 0,
        seed: cfg.seed
      });
      process.stderr.write(`${passed ? 'PASS' : 'FAIL'} (${vote.votes}/${vote.total} votes)\n`);
    } catch (e) {
      results.push({ model: cfg.model, case_id: c.id, domain: c.domain, mode: 'compute_control', passed: false, error: e.message, seed: cfg.seed });
      process.stderr.write(`ERROR: ${e.message}\n`);
    }
  }
  const outPath = path.resolve(cfg.out);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.passed).length;
  const totalTokens = results.reduce((s, r) => s + (r.inputTokens || 0) + (r.outputTokens || 0), 0);
  console.log(`Done: ${passed}/${results.length} passed, ${totalTokens} total tokens. Results: ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
