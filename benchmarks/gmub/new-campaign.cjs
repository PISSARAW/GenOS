'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function currentCommit() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim(); }
  catch (_) { return null; }
}

function workingTreeClean() {
  try { return execFileSync('git', ['status', '--porcelain'], { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8' }).trim() === ''; }
  catch (_) { return false; }
}

function parseArgs(args) {
  const cfg = { suite: 'gmub-r1', model: null, models: [], cases: [], out: null, seed: 42, topology: null, genosCommit: currentCommit(), workingTreeClean: workingTreeClean() };
  for (let i = 0; i < args.length; i += 1) {
    applyArgument({ cfg, key: args[i], value: args[i + 1] });
  }
  cfg.models = cfg.models.map((m) => m.trim()).filter(Boolean);
  cfg.cases = cfg.cases.map((c) => c.trim()).filter(Boolean);
  if (cfg.model && !cfg.models.includes(cfg.model)) cfg.models.push(cfg.model);
  if (!Number.isFinite(cfg.seed)) cfg.seed = 42;
  return cfg;
}

function applyArgument(input) {
  const { cfg, key, value } = input;
  switch (key) {
    case '--suite': cfg.suite = value; break;
    case '--model': cfg.model = value; break;
    case '--models': cfg.models = String(value || '').split(','); break;
    case '--cases': cfg.cases = String(value || '').split(','); break;
    case '--out': cfg.out = value; break;
    case '--seed': cfg.seed = Number(value); break;
    case '--topology': cfg.topology = value; break;
    default: break;
  }
}

function blankRun(cfg, spec, id) {
  return {
    suite: cfg.suite, case_id: id, model: spec.model, mode: spec.mode,
    genos_commit: cfg.genosCommit, working_tree_clean: cfg.workingTreeClean, topology: cfg.topology,
    declared_capabilities: [], activated_capabilities: [], observed_capabilities: [],
    requestedModel: spec.model, servedModel: null, domain: null, replicate: 0, status: 'pending',
    seed: cfg.seed, tokens: null, cost_usd: null, latency_ms: null, score: null
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
    suite: cfg.suite, model: cfg.model, genos_commit: cfg.genosCommit, working_tree_clean: cfg.workingTreeClean, topology: cfg.topology, seed: cfg.seed,
    budgets: { tokens: null, cost_usd: null, time_s: null },
    stats: { reps: 2000, seed: cfg.seed, alpha: 0.05, delta: 0 },
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
