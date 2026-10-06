'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const workspace = require('../src/services/globalWorkspaceService');
const persistence = require('../src/services/agow/agowStatePersistenceService');
const registry = require('../src/services/agow/workspaceReceiverRegistry');
const modes = require('../src/services/agow/cognitiveModeRuntimeService');
const experience = require('../src/services/agow/cognitiveModeExperienceService');
const queries = require('../src/services/agow/workspaceQueryService');
const pathways = require('../src/services/agow/pathways/directPathwayRegistry');
const router = require('../src/services/agow/pathways/directPathwayRouter');
const policy = require('../src/services/agow/agowMechanismPolicyService');

function frame(agentId = 'complete-agent') {
  return { agentId, frameId: 'complete-frame', activeGoal: 'validate a task', unresolvedQuestions: ['evidence'],
    epistemicState: { confidence: 0.9, uncertainty: 0.1, contradiction: 0 },
    causalContext: { predictionError: 0, triggeredBy: [] }, realityMode: 'real', secondaryContents: [] };
}

function query(input = {}) {
  return { queryId: `query-${Math.random()}`, frameId: 'complete-frame', candidateModules: ['probe'],
    need: { capability: 'verification' }, minimumEvidenceRefs: 0,
    budget: { maxCost: 0.2, deadlineAt: Date.now() + 2000 }, ...input };
}

async function initialize(db) {
  await db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=1000;
    CREATE TABLE IF NOT EXISTS adaptive_state(scope TEXT, key TEXT, payload_json TEXT,
      version INTEGER, updated_at TEXT, PRIMARY KEY(scope,key));
    CREATE TABLE IF NOT EXISTS adaptive_state_events(scope TEXT, key TEXT,
      event_type TEXT, event_payload TEXT, created_at TEXT);`);
}

async function receiptLifecycle(db) {
  const current = frame();
  const decision = await modes.choose({ frame: current, candidates: [], agentId: current.agentId, db });
  assert.ok(!decision.eligibleModes.includes('SIMULATE'));
  const receipt = await modes.record({ frame: current, decision, agentId: current.agentId, db });
  const result = await modes.execute({ frame: current, decision, receipt, agentId: current.agentId, db,
    runQuery: async () => ({ realizedLoss: null }) });
  assert.equal(result.outcomeReceipt, null);
  await assert.rejects(experience.observeOutcome({ agentId: current.agentId, db,
    receiptId: receipt.receiptId, realizedLoss: null }), /outcome-invalid/);
  const observed = await workspace.observeCognitiveOutcome({ agentId: current.agentId, db,
    receiptId: receipt.receiptId, realizedLoss: 0.2 });
  assert.equal(observed.realizedLoss, 0.2);
  await assert.rejects(experience.observeOutcome({ agentId: current.agentId, db,
    receiptId: receipt.receiptId, realizedLoss: 0.3 }), /already-recorded/);
}

async function queryLimits(db) {
  let calls = 0;
  registry.registerQuery({ module: 'probe', estimatedCost: 0.2,
    handle: async () => { calls++; return { summary: 'ok', outcome: { cost: 0.2 } }; } });
  registry.registerQuery({ module: 'second', estimatedCost: 0.2,
    handle: async () => { calls++; return { summary: 'second' }; } });
  const limited = await queries.execute({ frame: frame(), db,
    query: query({ candidateModules: ['probe', 'second'] }) });
  assert.equal(calls, 1);
  assert.equal(limited.responses[1].reason, 'query_budget_exhausted');
  registry.registerQuery({ module: 'slow', estimatedCost: 0,
    handle: async ({ signal }) => { await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(signal.aborted, true); return { summary: 'late' }; } });
  const expired = await queries.execute({ frame: frame(), db, query: query({ candidateModules: ['slow'],
    budget: { maxCost: 0, deadlineAt: Date.now() + 10 } }) });
  assert.equal(expired.responses[0].reason, 'query_deadline_exceeded');
  registry.registerQuery({ module: 'overrun', estimatedCost: 0.1,
    handle: async () => ({ outcome: { cost: 1 } }) });
  const overrun = await queries.execute({ frame: frame(), db, query: query({ candidateModules: ['overrun'] }) });
  assert.equal(overrun.responses[0].reason, 'query_cost_exceeded');
}

async function extensionPreservation(db) {
  const handle = async () => ({ summary: 'custom memory', outcome: { cost: 0 } });
  const oldRelease = registry.registerQuery({ module: 'memory', handle: async () => ({}) });
  registry.registerQuery({ module: 'memory', estimatedCost: 0, handle });
  oldRelease();
  await queries.plan({ frame: frame('extension-agent'), db, capability: 'recall' });
  assert.equal(registry.queryHandlersFor({ modules: ['memory'] })[0].handle, handle);
}

async function pathwayFailure(db) {
  await policy.update({ agentId: 'complete-agent', db, policy: { directPathways: 'bounded' } });
  const route = await pathways.register({ agentId: 'complete-agent', db, route: {
    pathwayId: 'known-path', source: 'memory', target: 'probe', capability: 'verification',
    semanticType: 'check', contextHash: '*', status: 'consolidated', confidence: 0.99 } });
  assert.equal(await router.resolveQuery({ agentId: 'complete-agent', db, capability: 'verification',
    contextHash: 'case', targets: ['memory'] }), null);
  registry.registerQuery({ module: 'probe', estimatedCost: 0, handle: async () => { throw new Error('drift'); } });
  registry.registerQuery({ module: 'fallback', estimatedCost: 0, handle: async () => ({ summary: 'fallback' }) });
  const transport = require('../src/services/signalingTransportService');
  const original = transport.publishSignal;
  transport.publishSignal = async () => ({ published: true });
  try {
    const result = await queries.execute({ frame: frame(), db,
      query: query({ pathwayRef: route.pathwayId, contextHash: 'case', fallbackModules: ['fallback'] }) });
    assert.equal(result.decompilation.decompiled, true);
    assert.equal(result.responses[1].response, 'fallback');
    assert.equal(result.directPathHits, 0);
    assert.equal((await pathways.list({ agentId: 'complete-agent', db }))[0].status, 'suspended');
    assert.equal((await require('../src/services/agow/candidatePoolService').list({ agentId: 'complete-agent', db })).length, 1);
    assert.equal(router.publish({ route: { ...route, status: 'suspended' } }).routed, false);
  } finally { transport.publishSignal = original; }
}

async function durableConcurrentReceipts(db, second) {
  await Promise.all(Array.from({ length: 8 }, (_, index) => experience.recordDecision({
    agentId: 'concurrent-agent', db: index % 2 ? db : second,
    receipt: { receiptId: `receipt-${index}`, chosenMode: 'ACT' } })));
  const restored = await experience.load({ agentId: 'concurrent-agent', db: second });
  assert.equal(restored.state.receipts.length, 8);
  assert.equal((await experience.load({ agentId: 'different-agent', db: second })).state.receipts, undefined);
}

async function automaticCycle(db) {
  const agentId = 'cycle-agent';
  const candidate = require('../src/services/agow/candidates/candidateAdapterService').build({ agentId,
    module: 'epistemic', observation: { confidence: 0.95, goalMatched: true, evidenceRefs: ['proof'], causalEvidence: true } });
  await require('../src/services/agow/candidatePoolService').submit({ candidate, db });
  registry.register({ module: 'probe', handle: async ({ phase }) => phase === 'inspect'
    ? { state: 0 } : { consumed: true, changed: true, state: 1 } });
  const release = workspace.configureRuntime({ agentId, db, receivers: ['probe'], skipTransport: true,
    modeCosts: { ACT: 0 }, ignitionThreshold: 0.1 });
  try {
    const result = await workspace.cycle({ agentId, db });
    assert.equal(result.modeReceipt.chosenMode, 'ACT');
    assert.equal(result.modeReceipt.realizedLoss, null);
    assert.equal(result.broadcast.deliveries[0].consumed, true);
    assert.equal((await workspace.getCurrentFrame({ agentId, db })).frameId, result.frame.frameId);
  } finally { release(); }
}

async function independentProcesses(filename) {
  const run = promisify(execFile);
  const worker = path.join(__dirname, 'helpers/agowReceiptWorker.cjs');
  await Promise.all(['left', 'right'].map((prefix) => run(process.execPath, [worker, filename, prefix])));
  const restored = await open({ filename, driver: sqlite3.Database });
  try {
    const loaded = await experience.load({ agentId: 'process-agent', db: restored });
    assert.equal(loaded.state.receipts.length, 8);
    assert.equal(new Set(loaded.state.receipts.map((item) => item.receiptId)).size, 8);
  } finally { await restored.close(); }
}

async function scopedQueryCycle(db) {
  const agentId = 'query-cycle-agent';
  const adapter = require('../src/services/agow/candidates/candidateAdapterService');
  const candidate = adapter.build({ agentId, module: 'epistemic', observation: {
    confidence: 0.2, goalMatched: true, evidenceRefs: ['proof'], causalEvidence: true } });
  await require('../src/services/agow/candidatePoolService').submit({ candidate, db });
  let calls = 0;
  const release = workspace.configureRuntime({ agentId, db, ignitionThreshold: 0.1,
    unresolvedQuestions: ['verify'], queryCosts: { verifier: 0 },
    queryHandlers: { verifier: async () => { calls++; return { summary: 'scoped verifier', outcome: { cost: 0 } }; } },
    modeCosts: { ACT: 100, OBSERVE: 100, RECALL: 100, ABSTAIN: 100, VERIFY: 0 } });
  try {
    const result = await workspace.cycle({ agentId, db });
    assert.equal(result.modeReceipt.chosenMode, 'VERIFY');
    assert.equal(calls, 1);
    assert.equal(result.activeQuery.result.responses[0].response, 'scoped verifier');
    assert.equal(require('../src/services/agow/agowRuntimeBindingsService').resolve({ agentId: 'other', db }).queryHandlers.verifier, undefined);
    const skipped = await modes.execute({ decision: { mode: 'VERIFY' }, runQuery: async () => ({ planned: false }) });
    assert.equal(skipped.executed, false);
  } finally { release(); }
}

async function builtinModes(db) {
  const agentId = 'builtin-agent';
  await policy.update({ agentId, db, policy: { proceduralization: 'bounded', markets: 'shadow' } });
  await persistence.save({ scope: 'agow_cognitive_trajectories', agentId, db, state: {
    trajectories: Array.from({ length: 10 }, (_, index) => ({ trajectoryId: `trajectory-${index}`,
      stepRefs: ['perceive', 'verify', 'report'], success: true, context: {},
      evidenceRefs: [`evidence-${index}`], outcomeRefs: [`outcome-${index}`] })) } });
  const builtin = require('../src/services/agow/cognitiveModeBuiltinExecutors');
  const consolidated = await builtin.CONSOLIDATE({ frame: frame(agentId), db });
  assert.equal(consolidated.executed, true);
  assert.equal(consolidated.proposal.promotionRequested, false);
  const reorganized = await builtin.REORGANIZE({ frame: frame(agentId), db,
    candidates: [{ source: { module: 'memory' }, evidenceRefs: ['evidence'] }] });
  assert.equal(reorganized.accepted, true);
  assert.equal(reorganized.activated, false);
  const failed = await modes.execute({ decision: { mode: 'CONSOLIDATE' },
    modeExecutors: { CONSOLIDATE: async () => { throw new Error('executor failed'); } } });
  assert.equal(failed.reason, 'mode_executor_failed');
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-agow-'));
  const filename = path.join(directory, 'state.sqlite');
  const db = await open({ filename, driver: sqlite3.Database });
  const second = await open({ filename, driver: sqlite3.Database });
  try {
    await initialize(db);
    await second.exec('PRAGMA busy_timeout=1000;');
    await receiptLifecycle(db);
    await queryLimits(db);
    await extensionPreservation(db);
    await pathwayFailure(db);
    await durableConcurrentReceipts(db, second);
    await independentProcesses(filename);
    await automaticCycle(db);
    await scopedQueryCycle(db);
    await builtinModes(db);
    assert.ok((await persistence.load({ scope: 'agow_query_receipts', agentId: 'complete-agent', db: second })).state.receipts.length >= 4);
  } finally {
    registry.clear();
    await db.close(); await second.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('genos-agow-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
  console.log('AGOW completion: real SQLite, mode receipts, bounded queries, custom bindings, direct failure and automatic cycle passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
