'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFileSync, spawnSync } = require('node:child_process');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { executeLeanCheck } = require('../src/services/epistemicScheduler/leanProcessExecutor');
const { createScientificReceiptAuthority } = require('../src/services/scientificReceiptAuthority');
const { createScientificReferenceStore } = require('../src/services/scientificReferences');
const { createScientificWorkflow } = require('../src/services/scientificWorkflowService');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');

const scope = { organizationId: 'p1-live-org', projectId: 'p1-live-project', workspaceId: 'p1-live-workspace' };
const ref = { ...scope, objectType: 'theorem', objectId: 'source', version: 1 };
const source = 'theorem source : 0 = 0 := by rfl';
const hash = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

async function configuration() {
  const leanExecutable = process.env.GENOS_LEAN_EXECUTABLE;
  if (!leanExecutable) throw new Error('GENOS_LEAN_EXECUTABLE required; real Lean qualification cannot be substituted.');
  const toolchainVersion = execFileSync(leanExecutable, ['--version'], { windowsHide: true, encoding: 'utf8' }).trim();
  const environmentDigest = hash(await fs.readFile(leanExecutable));
  return { leanExecutable, toolchainVersion, environmentDigest, strictToolchainVersion: true };
}

async function database(filename) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec(`CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT OR IGNORE INTO workspaces VALUES ('p1-live-workspace','p1-live-org','p1-live-project');
    INSERT OR IGNORE INTO agents VALUES ('author','p1-live-workspace');
    INSERT OR IGNORE INTO agents VALUES ('consumer','p1-live-workspace');`);
  return db;
}

async function primary(filename, config) {
  const db = await database(filename);
  try {
    let compilations = 0;
    const executor = async request => { compilations++; return measuredLeanCheck({ ...request, ...config }); };
    const graph = new MathematicalDependencyGraph();
    graph.addNode({ nodeId: 'source', type: 'theorem', canonicalStatement: '0 = 0', status: 'formalized' });
    const gate = new LeanIncrementalGate({ graph, ...config, executor });
    const receipt = await gate.verifyNode({ nodeId: 'source', source, timeoutMs: 90000 });
    assert.equal(receipt.status, 'passed', JSON.stringify(receipt));
    const authority = createScientificReceiptAuthority({ db, ...config, executor });
    await authority.attest({ receipt, ref, source, canonicalStatement: '0 = 0' });
    assert.equal(compilations, 2);
    const store = createScientificReferenceStore({ verifyReceipt: authority.verifyReceipt });
    const workflow = createScientificWorkflow({ db, referenceStore: store });
    await workflow.subscribeReference({ ref, consumerAgentId: 'consumer' });
    const published = await workflow.publishVerified({ senderAgentId: 'author', receiptDigest: receipt.receiptDigest,
      contentBytes: Buffer.from(source), reference: { ...ref, canonicalStatement: '0 = 0',
        contentDigest: hash(source), sourceDigest: receipt.sourceDigest,
        formalStatementDigest: receipt.formalStatementDigest, environmentDigest: config.environmentDigest,
        assumptions: [], validityDomain: 'direct formal Nat equality', dependencies: [] } });
    assert.deepEqual(published.recipients, ['consumer']);
    assert.equal((await store.resolveReference(db, { ref, requesterScope: scope })).content, source);
    await assert.rejects(store.resolveReference(db, { ref, requesterScope: { ...scope, projectId: 'foreign' } }),
      { code: 'SCI_REF_SCOPE_FORBIDDEN' });
    await forgedFalseReceipt(authority, config);
    console.log(JSON.stringify({ phase: 'primary', leanExecutions: compilations, publication: published.status,
      localBinding: 'executable-hash-only', transitiveImportsAudit: false }));
  } finally { globalRegistry.clear(); await db.close(); }
}

async function measuredLeanCheck(request) {
  const result = await executeLeanCheck({ ...request, timeoutMs: 90000 });
  console.log(JSON.stringify({ phase: 'lean-process', exitCode: result.exitCode,
    stdout: result.stdout, stderr: result.stderr, killed: result.error?.killed,
    signal: result.error?.signal, errorCode: result.error?.code }));
  return result;
}

async function forgedFalseReceipt(authority, config) {
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'false', type: 'theorem', canonicalStatement: '(0 : Nat) = 1', status: 'formalized' });
  const forged = new LeanIncrementalGate({ graph, ...config,
    executor: async () => ({ exitCode: 0, toolchainVersion: config.toolchainVersion, axioms: [] }) });
  const badSource = 'theorem false_claim : (0 : Nat) = 1 := by rfl';
  const receipt = await forged.verifyNode({ nodeId: 'false', source: badSource });
  assert.equal(receipt.status, 'passed', 'negative probe deliberately simulates a lying producer');
  await assert.rejects(authority.attest({ receipt, ref: { ...ref, objectId: 'false' }, source: badSource,
    canonicalStatement: '(0 : Nat) = 1' }), { code: 'SCI_RECEIPT_REPLAY_FAILED' });
}

async function restart(filename, config) {
  globalRegistry.clear();
  const db = await database(filename);
  try {
    let replays = 0;
    const authority = createScientificReceiptAuthority({ db, ...config, executor: async request => {
      replays++; return measuredLeanCheck({ ...request, ...config });
    } });
    const store = createScientificReferenceStore({ verifyReceipt: authority.verifyReceipt });
    assert.equal((await store.resolveReference(db, { ref, requesterScope: scope })).content, source);
    assert.equal(replays, 1);
    await store.resolveReference(db, { ref, requesterScope: scope });
    assert.equal(replays, 1);
    await db.run('UPDATE scientific_receipt_authority SET source_bytes=?', Buffer.from(source + '\n-- tampered'));
    await assert.rejects(store.resolveReference(db, { ref, requesterScope: scope }), { code: 'SCI_RECEIPT_INTEGRITY' });
    console.log(JSON.stringify({ phase: 'fresh-process', actualLeanReplays: replays, tamperRefused: true }));
  } finally { globalRegistry.clear(); await db.close(); }
}

async function main() {
  const config = await configuration();
  if (process.argv[2] === '--restart') return restart(process.argv[3], config);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-live-'));
  try {
    const filename = path.join(directory, 'qualification.db');
    await primary(filename, config);
    await require('./helpers/qualifyScientificProducer.cjs').qualifyProducer({
      filename: path.join(directory, 'producer.db'), config });
    const child = spawnSync(process.execPath, [__filename, '--restart', filename],
      { windowsHide: true, encoding: 'utf8', timeout: 90000, env: process.env });
    process.stdout.write(child.stdout);
    process.stderr.write(child.stderr);
    assert.equal(child.status, 0, 'fresh-process replay must succeed');
    console.log('Real Lean authority and scientific publication qualification passed.');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
