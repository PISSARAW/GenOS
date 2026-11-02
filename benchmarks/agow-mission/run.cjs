'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { open } = require('../../backend/node_modules/sqlite');
const sqlite3 = require('../../backend/node_modules/sqlite3');
const workspace = require('../../backend/src/services/globalWorkspaceService');
const pool = require('../../backend/src/services/agow/candidatePoolService');
const registry = require('../../backend/src/services/agow/workspaceReceiverRegistry');
const adapter = require('../../backend/src/services/agow/candidates/candidateAdapterService');
const bridge = require('../../backend/src/services/agow/missionObservationRuntimeBridge');
const { digest } = require('../../backend/src/services/evidenceProtocol/canonical');
const { execute } = require('./process.cjs');

const ROOT = path.resolve(__dirname, '../..');
const ORDERS = [{ customer: 'alice', quantity: 4 }, { customer: 'bob', quantity: 3 },
  { customer: 'alice', quantity: -2 }, { customer: 'carol', quantity: 0 },
  { customer: 'bob', quantity: 7 }, { customer: 'alice', quantity: 5 }];
const SOURCES = ['benchmarks/agow-mission/run.cjs', 'benchmarks/agow-mission/worker.cjs',
  'benchmarks/agow-mission/oracle.cjs', 'benchmarks/agow-mission/process.cjs', 'benchmarks/agow-mission/verify.cjs',
  'backend/src/services/globalWorkspaceService.js', 'backend/src/services/agow/workspaceCycleService.js',
  'backend/src/services/agow/workspaceBroadcastService.js', 'backend/src/services/agow/cognitiveModeRuntimeService.js',
  'backend/src/services/agow/missionObservationService.js', 'backend/src/services/agow/missionObservationContract.js',
  'backend/src/services/agow/missionObservationRuntimeBridge.js', 'backend/src/services/agow/agowRuntimeBindingsService.js',
  'backend/src/services/agow/agowStatePersistenceService.js', 'backend/src/services/evidenceProtocol/canonical.js',
  'backend/package-lock.json'];

async function initialize(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE adaptive_state(scope TEXT, key TEXT, payload_json TEXT, version INTEGER,
      updated_at TEXT, PRIMARY KEY(scope,key));
    CREATE TABLE adaptive_state_events(scope TEXT, key TEXT, event_type TEXT,
      event_payload TEXT, created_at TEXT);`);
  return db;
}

async function prepare(options) {
  const { db, label, orders } = options;
  const agentId = `agow-mission:${label}`;
  let received = null;
  const release = registry.register({ module: 'mission_dispatch', handle: async ({ phase, candidate }) => {
    if (phase === 'inspect') return { received };
    received = JSON.parse(candidate.content.compactPreview);
    return { consumed: true, changed: true, state: { received }, downstreamAction: `aggregate:${label}` };
  } });
  try {
    const candidate = adapter.build({ agentId, module: 'perception', observation: {
      compactPreview: JSON.stringify(orders), confidence: 0.99, goalMatched: true, actionable: true,
      evidenceRefs: [digest(orders)], causalEvidence: false } });
    const admission = await pool.submit({ candidate, db });
    if (!admission.accepted) throw new Error(admission.reason);
    const cycle = await workspace.cycle({ agentId, db, activeGoal: label, ignitionThreshold: 0.1,
      receivers: ['mission_dispatch'], skipTransport: true, modeCosts: { ACT: 0 } });
    if (!received || cycle.modeResult?.executed !== true) throw new Error('Mission dispatch was not executed.');
    const ctx = { agentId, db, normalizedMission: { missionId: label }, executionRun: { id: `run:${label}` },
      agow: { accepted: true, activation: 'bounded', candidateId: candidate.candidateId,
        frame: cycle.frame, modeReceipt: cycle.modeReceipt } };
    await bridge.start(ctx);
    return { ctx, received, cycle };
  } finally { release(); }
}

async function mission(options) {
  const { ctx, received, cycle } = await prepare(options);
  const started = performance.now();
  const answer = await execute('worker.cjs', { orders: received, fault: options.fault });
  const workerDurationMs = performance.now() - started;
  const event = { eventId: `completed:${options.label}`, eventType: 'AGENT_COMPLETED', agentId: ctx.agentId,
    payload: { executionRunId: ctx.executionRun.id, missionId: options.label, success: true, outputDigest: digest(answer) } };
  const release = workspace.configureRuntime({ agentId: ctx.agentId, db: options.db,
    missionOutcomeVerifier: async (input) => execute('oracle.cjs', { orders: options.orders, answer,
      bindingHash: input.binding.bindingHash, eventDigest: input.eventIdentity.eventDigest,
      outputDigest: input.event.payload.outputDigest }, input.signal) });
  try {
    const observation = await bridge.observe(ctx, event);
    if (observation.status !== 'verified') throw new Error(`Verification did not complete: ${observation.status}`);
    return { label: options.label, faultInjected: options.fault, orders: options.orders, answer, event,
      workerDurationMs, tokens: null, costUsd: null,
      taskSucceeded: observation.observation.metrics.realizedLoss === 0,
      deliveryConsumed: cycle.broadcast.deliveries[0].consumed, observation };
  } finally { release(); }
}

async function manifest(directory) {
  const sources = {};
  for (const file of SOURCES) sources[file] = digest(await fs.readFile(path.join(ROOT, file), 'utf8'));
  const result = { schema: 'genos.agow.mission-demo/v1', createdAt: new Date().toISOString(),
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    node: process.version, sources, orders: ORDERS,
    protocol: { primaryMetric: 'fraction_of_incorrect_customer_totals', targetLoss: 0,
      qualification: 'local_deterministic_engineering_demo', transport: 'local_delivery',
      conditions: ['correct_worker', 'worker_with_injected_fault'], promotionAllowed: false } };
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(result, null, 2));
  return result;
}

async function run() {
  const outputRoot = process.env.GENOS_AGOW_DEMO_ROOT || path.join(ROOT, '.genos-agent-worlds/agow-mission-observation');
  const directory = path.join(outputRoot, randomUUID());
  await fs.mkdir(directory, { recursive: true });
  const preregistered = await manifest(directory);
  const db = await initialize(path.join(directory, 'receipts.sqlite'));
  try {
    const results = [];
    for (const fault of [false, true]) results.push(await mission({ db, orders: ORDERS,
      label: fault ? 'worker_with_injected_fault' : 'correct_worker', fault }));
    const report = { manifestHash: digest(preregistered), promotionAllowed: false, results };
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2));
    return { directory, results: results.map((result) => ({ label: result.label,
      taskSucceeded: result.taskSucceeded, realizedLoss: result.observation.observation.metrics.realizedLoss })) };
  } finally { await db.close(); }
}

if (require.main === module) run().then((result) => console.log(JSON.stringify(result)))
  .catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = { run, SOURCES };
