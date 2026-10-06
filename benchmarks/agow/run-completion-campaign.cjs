'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const experiments = require('../../backend/src/services/agow/agowExperimentService');
const references = require('./reference-models.cjs');
const data = require('./completion-corpus.cjs');
const workspace = require('./completion-workspace.cjs');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.join(ROOT, '.genos-agent-worlds/agow-completion-campaign-v3');
const PROTOCOL = Object.freeze({ hypothesis: 'Measured feedback permits adaptation after actuator damage.',
  primaryMetric: 'meanErrors', analysisPlan: 'Paired per-case absolute control error; descriptive means, no promotion.',
  successThreshold: 0.12, fixedSeeds: ['agow-holdout-G', 'agow-holdout-H', 'agow-holdout-I'],
  version: 3, calibration: 'All variants start from the same measured gain=1.',
  count: 16, steps: 24, damageStep: 8, qualification: 'synthetic_local_engineering_holdout' });

async function environment() {
  const files = ['reference-models.cjs', 'completion-corpus.cjs', 'completion-workspace.cjs', 'run-completion-campaign.cjs'];
  const sources = {};
  for (const file of files) sources[file] = data.hash(await fs.readFile(path.join(__dirname, file), 'utf8'));
  for (const file of ['agow/workspaceCycleService.js', 'agow/workspaceBroadcastService.js',
    'agow/cognitiveModeRuntimeService.js', 'predictiveTimescale/predictiveTimescaleService.js',
    'selfTwin/selfTwinService.js', 'selfTwin/selfTwinEdgeLearningService.js']) {
    sources[file] = data.hash(await fs.readFile(path.join(ROOT, 'backend/src/services', file), 'utf8'));
  }
  return { model: { provider: 'deterministic_reference', modelId: 'linear-damaged-actuator-v1', sources },
    dependencies: { node: process.version, platform: process.platform,
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
      backendLockHash: data.hash(await fs.readFile(path.join(ROOT, 'backend/package-lock.json'), 'utf8')) },
    toolLease: [], execution: 'local SQLite, no LLM, no external actuation',
    qualification: PROTOCOL.qualification };
}

function runReference(input, plant) {
  const state = references.create(input.condition);
  // Identical pre-holdout calibration, disjoint from the damaged test stream.
  references.observe(state, { target: 0.5, output: 0.5, observedGain: 1, ref: 'training:0',
    probeCommand: 0.5, probeOutput: 0.5, controlOutput: 0 });
  state.errors = [];
  for (const [step, target] of input.input.targets.entries()) {
    const command = references.command(state, target);
    const observed = data.observation({ plant, step, target, command, caseId: input.caseId,
      controlled: input.condition === 'self_twin_controlled_links' });
    references.observe(state, observed);
  }
  const errors = state.errors.reduce((sum, value) => sum + value, 0) / state.errors.length;
  const probes = input.condition === 'self_twin_controlled_links' ? input.input.targets.length * 2 : 0;
  return { success: errors <= PROTOCOL.successThreshold, errors, cost: input.input.targets.length + probes,
    taskUtility: Math.max(0, 1 - errors), trace: state.observations, errorSeries: state.errors,
    evidenceRefs: state.observations.map((item) => item.ref || item.evidenceRefs?.[0]).filter(Boolean),
    controlledProbes: probes };
}

async function setup(db) {
  await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS adaptive_state(scope TEXT, key TEXT, payload_json TEXT,
      version INTEGER, updated_at TEXT, PRIMARY KEY(scope,key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events(scope TEXT, key TEXT,
      event_type TEXT, event_payload TEXT, created_at TEXT);`);
}

async function main() {
  await fs.mkdir(OUTPUT, { recursive: true });
  const manifest = await environment();
  const runtimeNamespace = randomUUID();
  const db = await open({ filename: path.join(OUTPUT, 'receipts.sqlite'), driver: sqlite3.Database });
  const receipts = [];
  try {
    await setup(db);
    const replications = PROTOCOL.fixedSeeds.map((seed) => {
      const corpus = data.corpus(seed, PROTOCOL.count);
      return { agentId: `campaign:${seed}`, db, seed, holdout: true, snapshot: { calibratedGain: 1 },
        environment: manifest, cases: corpus.cases, protocol: PROTOCOL, conditions: references.CONDITIONS,
        execute: async (input) => runReference(input, corpus.plants.get(input.caseId)) };
    });
    // Seal inputs, protocol and environment before observing any outcome.
    await fs.writeFile(path.join(OUTPUT, 'manifest.json'), JSON.stringify({ manifest, runtimeNamespace, protocol: PROTOCOL,
      corpora: replications.map((run) => ({ seed: run.seed, hash: data.hash(run.cases), cases: run.cases })) }, null, 2));
    const replication = await experiments.runReplicationCampaign({ replications });
    for (const run of replications) {
      const stored = await experiments.list({ agentId: run.agentId, db });
      receipts.push(stored[stored.length - 1]);
    }
    const cases = data.corpus('agow-mediation-v3', PROTOCOL.count).cases;
    const control = { agentId: 'campaign:mediation', db, cases, seed: 'agow-mediation-v3', holdout: true,
      snapshot: {}, environment: manifest,
      protocol: { hypothesis: 'Workspace delivery changes the receiving actuator target.', primaryMetric: 'successRate',
        analysisPlan: 'Paired delivered/suppressed comparison, same receiver; local causal contrast only.' },
      execute: (input) => workspace.execute({ ...input, db, namespace: runtimeNamespace }) };
    const mediation = await experiments.runControlledMediation(control);
    const ablation = await experiments.run({ ...control, agentId: 'campaign:ablation', seed: 'agow-ablation',
      conditions: ['full', 'broadcast_ablated'] });
    receipts.push(mediation, ablation);
    const report = { createdAt: new Date().toISOString(), manifest, runtimeNamespace, protocol: PROTOCOL, replication,
      receipts, artifactHash: data.hash(receipts), promotionDecision: null,
      scope: 'Reference-inspired linear simulator and real local workspace delivery; no published-model reproduction or business validation.' };
    await fs.writeFile(path.join(OUTPUT, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output: OUTPUT, artifactHash: report.artifactHash, replication,
      summaries: receipts.map((receipt) => ({ seed: receipt.seed, summary: receipt.summary })) }, null, 2));
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
