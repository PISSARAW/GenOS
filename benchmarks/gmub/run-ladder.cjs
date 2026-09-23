'use strict';
// Phase 1 — ladder solo via provider://model direct.
// Usage: node benchmarks/gmub/run-ladder.cjs --models m1,m2,m3 --cases cases.json --out results.json [--seed N] [--timeout-ms N]
const fs = require('fs');
const path = require('path');
const mp = require('../../backend/src/services/modelProvider');

function parseArgs(argv) {
  const cfg = { models: [], cases: null, out: null, seed: 42, timeoutMs: 180000 };
  for (let i = 2; i < argv.length; i += 2) {
    if (argv[i] === '--models') cfg.models = argv[i + 1].split(',').map(s => s.trim()).filter(Boolean);
    if (argv[i] === '--cases') cfg.cases = argv[i + 1];
    if (argv[i] === '--out') cfg.out = argv[i + 1];
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

function scoreCase(answer, expected, pattern) {
  if (pattern) {
    try { return new RegExp(pattern, 'i').test(answer); } catch (_) { return false; }
  }
  const a = answer.toLowerCase().trim();
  const e = expected.toLowerCase().trim();
  if (a === e) return true;
  if (a.includes(e)) return true;
  const an = parseFloat(a);
  const en = parseFloat(e);
  if (!Number.isNaN(an) && !Number.isNaN(en) && an === en) return true;
  return false;
}

async function runCase(model, testCase, opts) {
  const seed = opts.seed || 42;
  const timeoutMs = opts.timeoutMs || 30000;
  const start = Date.now();
  const result = await mp.generate({
    model,
    prompt: testCase.prompt,
    maxTokens: 256,
    seed,
    stream: false,
    timeoutMs
  });
  const latencyMs = Date.now() - start;
  const text = result.text || '';
  const answer = extractAnswer(text);
  const passed = scoreCase(answer, testCase.expected, testCase.pattern);
  return {
    model,
    case_id: testCase.id,
    domain: testCase.domain,
    raw: text.slice(0, 500),
    answer,
    expected: testCase.expected,
    passed,
    inputTokens: result.inputTokens || 0,
    outputTokens: result.outputTokens || 0,
    latencyMs,
    costUsd: 0,
    seed
  };
}

async function main() {
  const cfg = parseArgs(process.argv);
  if (!cfg.models.length || !cfg.cases || !cfg.out) {
    console.error('Usage: node run-ladder.cjs --models m1,m2,m3 --cases cases.json --out results.json [--seed N] [--timeout_ms N]');
    process.exit(1);
  }
  const cases = JSON.parse(fs.readFileSync(path.resolve(cfg.cases), 'utf8'));
  const results = [];
  for (const model of cfg.models) {
    for (const c of cases.cases) {
      process.stderr.write(`Running ${model} on ${c.id}... `);
      try {
        const r = await runCase(model, c, { seed: cfg.seed, timeoutMs: cfg.timeoutMs });
        results.push(r);
        process.stderr.write(`${r.passed ? 'PASS' : 'FAIL'} (${r.latencyMs}ms)\n`);
      } catch (e) {
        results.push({ model, case_id: c.id, domain: c.domain, passed: false, error: e.message, latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, seed: cfg.seed });
        process.stderr.write(`ERROR: ${e.message}\n`);
      }
    }
  }
  const outPath = path.resolve(cfg.out);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  const passed = results.filter(r => r.passed).length;
  console.log(`Done: ${passed}/${results.length} passed. Results: ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
