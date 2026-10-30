'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'lean-regression-local-test-key';
process.env.GENOS_LEAN_TEST_SECRET = 'must-not-reach-lean';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { execFileSync } = require('node:child_process');
const { leanTestConfiguration } = require('./helpers/leanTestConfiguration.cjs');
const { executeLeanCheck } = require('../src/services/epistemicScheduler/leanProcessExecutor');
const { MathematicalDependencyGraph, LeanIncrementalGate, receiptDigest } = require('../src/services/epistemicScheduler');
const { VerificationRegistry } = require('../src/services/mathematical/verificationRegistry');
const { createScientificReceiptAuthority } = require('../src/services/scientificReceiptAuthority');
const { createRegistry } = require('../src/services/cognitiveEpistemicCheckService');

async function omega(config) {
  const registry = createRegistry();
  const sources = [
    ['positive', '0 = 0', 'theorem p : 0 = 0 := by rfl\n#eval show IO Unit from do\n  if (← IO.getEnv "GENOS_LEAN_TEST_SECRET").isSome then throw (IO.userError "inherited secret")', 'verified'],
    ['sorry', 'False', 'theorem p : False := by sorry', 'inconclusive'],
    ['sorryAx', 'False', 'theorem p : False := by exact sorryAx False false', 'inconclusive'],
    ['mismatch', 'False', 'theorem p : 0 = 0 := by rfl', 'inconclusive'],
    ['failed-proof', 'False', 'theorem p : False := by rfl', 'inconclusive'],
  ];
  for (const [id, statement, source, expected] of sources) {
    registry.register(id, { type: 'lean', ...config, source, canonicalStatement: statement });
    const result = await registry.get(id)({ candidate: null });
    assert.equal(result.status, expected, `${id}: ${result.reason} ${result.execution?.stderr || result.execution?.stdout || ''}`);
    assert.equal(result.valid, expected === 'verified', id);
  }
  console.log('Real Lean Omega: positive, placeholders, statement binding and failed compilation PASS.');
}

async function falseReceipt(config) {
  const source = 'theorem bad : False := by exact sorryAx False false';
  const audited = await executeLeanCheck({ ...config, source });
  assert.equal(audited.exitCode, 0, audited.stderr);
  assert.deepEqual(audited.axioms, ['sorryAx']);
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'bad', type: 'theorem', canonicalStatement: 'False', status: 'formalized' });
  const gate = new LeanIncrementalGate({ graph, ...config, executor: executeLeanCheck,
    registry: new VerificationRegistry(), allowedAxioms: ['sorryAx'] });
  const rejected = await gate.verifyNode({ nodeId: 'bad', source });
  assert.equal(rejected.status, 'failed');
  const forged = { ...rejected, status: 'passed', reason: null, axioms: [] };
  forged.receiptDigest = receiptDigest(forged);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const authority = createScientificReceiptAuthority({ db, ...config });
    await assert.rejects(authority.attest({ receipt: forged, source, canonicalStatement: 'False',
      ref: { organizationId: 'audit', projectId: 'audit', workspaceId: 'audit',
        objectType: 'theorem', objectId: 'bad', version: 1 } }), { code: 'SCI_RECEIPT_SOURCE' });
    // Re-run the original zero-axiom lie on a source without placeholders below.
  } finally { await db.close(); }
  console.log('Real Lean sorryAx is audited and cannot be allowlisted or attested PASS.');
}

async function importedAxiom(config, directory) {
  await fs.writeFile(path.join(directory, 'AuditAxioms.lean'), 'axiom audit_bad : False\n');
  execFileSync(config.leanExecutable, ['-o', 'AuditAxioms.olean', 'AuditAxioms.lean'], {
    cwd: directory, windowsHide: true, timeout: 90000 });
  const previous = process.env.LEAN_PATH;
  process.env.LEAN_PATH = [directory, previous].filter(Boolean).join(path.delimiter);
  try {
    const source = 'import AuditAxioms\ntheorem bad : False := audit_bad';
    const audited = await executeLeanCheck({ ...config, environmentDigest: undefined, source });
    assert.equal(audited.exitCode, 0, JSON.stringify(audited));
    assert.deepEqual(audited.axioms, ['audit_bad']);
    const pinned = { ...config, environmentDigest: audited.environmentDigest };
    const graph = new MathematicalDependencyGraph();
    graph.addNode({ nodeId: 'bad', type: 'theorem', canonicalStatement: 'False', status: 'formalized' });
    const gate = new LeanIncrementalGate({ graph, ...pinned, executor: executeLeanCheck });
    const receipt = await gate.verifyNode({ nodeId: 'bad', source });
    assert.equal(receipt.status, 'failed');
    const forged = { ...receipt, status: 'passed', reason: null, axioms: [] };
    forged.receiptDigest = receiptDigest(forged);
    const db = await open({ filename: ':memory:', driver: sqlite3.Database });
    try {
      const authority = createScientificReceiptAuthority({ db, ...pinned });
      await assert.rejects(authority.attest({ receipt: forged, source, canonicalStatement: 'False',
        ref: { organizationId: 'audit', projectId: 'audit', workspaceId: 'audit',
          objectType: 'theorem', objectId: 'bad', version: 1 } }), { code: 'SCI_RECEIPT_REPLAY_FAILED' });
    } finally { await db.close(); }
    const mismatch = await executeLeanCheck({ ...config, source });
    assert.equal(mismatch.reason, 'lean_environment_mismatch');
    console.log('Real Lean transitive imported axiom, scientific replay and environment mismatch PASS.');
  } finally {
    if (previous === undefined) delete process.env.LEAN_PATH;
    else process.env.LEAN_PATH = previous;
  }
}

async function dependencyProof(config) {
  const graph = new MathematicalDependencyGraph();
  graph.addNode({ nodeId: 'p', type: 'lemma', canonicalStatement: '0 = 0', status: 'formalized' });
  graph.addNode({ nodeId: 'c', type: 'theorem', canonicalStatement: '0 = 0', status: 'formalized' });
  graph.addEdge({ from: 'p', to: 'c', type: 'uses' });
  const gate = new LeanIncrementalGate({ graph, ...config, executor: executeLeanCheck });
  const source = 'theorem parent_result : 0 = 0 := by rfl';
  const parent = await gate.verifyNode({ nodeId: 'p', source });
  assert.equal(parent.status, 'passed');
  const child = await gate.verifyNode({ nodeId: 'c', source: 'theorem child_result : 0 = 0 := parent_result' });
  assert.equal(child.status, 'passed', JSON.stringify(child));
  assert.equal(child.dependencyReceiptDigests.length, 1);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const authority = createScientificReceiptAuthority({ db, ...config });
    const attested = await authority.attest({ receipt: parent, source, canonicalStatement: '0 = 0',
      ref: { organizationId: 'audit', projectId: 'audit', workspaceId: 'audit',
        objectType: 'theorem', objectId: 'p', version: 1 } });
    assert.equal(attested.receipt.status, 'passed');
  } finally { await db.close(); }
  console.log('Real Lean prerequisite source is materialized and used by child PASS.');
}

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-lean-regressions-'));
  try {
    const config = await leanTestConfiguration();
    await omega(config);
    await falseReceipt(config);
    await importedAxiom(config, directory);
    await dependencyProof(config);
    console.log('Real Lean kernel regressions PASS.');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
