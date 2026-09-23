'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const cfg = { suite: 'gmub-r1', model: null, models: [], cases: [], out: null };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === '--suite') cfg.suite = args[i + 1];
    if (key === '--model') cfg.model = args[i + 1];
    if (key === '--models') cfg.models = String(args[i + 1] || '').split(',');
    if (key === '--cases') cfg.cases = String(args[i + 1] || '').split(',');
    if (key === '--out') cfg.out = args[i + 1];
  }
  cfg.models = cfg.models.map((m) => m.trim()).filter(Boolean);
  cfg.cases = cfg.cases.map((c) => c.trim()).filter(Boolean);
  return cfg;
}

function blankRun(cfg, spec, id) {
  return {
    suite: cfg.suite, case_id: id, model: spec.model, mode: spec.mode,
    genos_commit: null, topology: null,
    declared_capabilities: [], activated_capabilities: [], observed_capabilities: [],
    seed: 42, tokens: null, cost_usd: null, latency_ms: null, score: null
  };
}

function buildRuns(cfg) {
  const runs = [];
  for (const model of cfg.models) {
    for (const id of cfg.cases) runs.push(blankRun(cfg, { model, mode: 'solo' }, id));
  }
  for (const id of cfg.cases) {
    runs.push(blankRun(cfg, { model: cfg.model, mode: 'compute_control' }, id));
    runs.push(blankRun(cfg, { model: cfg.model, mode: 'genos' }, id));
  }
  return runs;
}

function buildSkeleton(cfg) {
  return {
    suite: cfg.suite, model: cfg.model, genos_commit: null, topology: null, seed: 42,
    budgets: { tokens: null, cost_usd: null, time_s: null },
    stats: { reps: 2000, seed: 42, alpha: 0.05, delta: 0 },
    cost: { soloQuality: null, genosQuality: null, soloCost: null, genosCost: null, soloTokens: null, genosTokens: null },
    wmc: { frontier: null, margin: 0 },
    runs: buildRuns(cfg),
    gcab: { run: null, contract: { required: [] }, ablations: [], biomimicry: [] }
  };
}

function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (!cfg.model || !cfg.models.length || !cfg.cases.length || !cfg.out) {
    console.error('Usage: node benchmarks/gmub/new-campaign.cjs --suite S --model BASE --models m1,m2,m3 --cases c1,c2 --out campaign.json');
    process.exit(1);
  }
  fs.writeFileSync(path.resolve(cfg.out), JSON.stringify(buildSkeleton(cfg), null, 2));
  console.log(`Skeleton written: ${cfg.out} (${buildRuns(cfg).length} runs to measure)`);
}

if (require.main === module) main();

module.exports = { parseArgs, buildSkeleton };
