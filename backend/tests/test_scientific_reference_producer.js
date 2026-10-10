'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { MathematicalDependencyGraph, LeanIncrementalGate } = require('../src/services/epistemicScheduler');
const { createFormalizationArtifact } = require('../src/services/mathematical/formalizationArtifact');
const { createMathematicalOrganismRuntime } = require('../src/services/mathematical/mathematicalOrganismRuntime');
const { createScientificReferenceProducer } = require('../src/services/mathematical/scientificReferenceProducer');
const { createScientificReferenceStore, formatReference } = require('../src/services/scientificReferences');
const { createScientificWorkflow } = require('../src/services/scientificWorkflowService');
const { globalRegistry } = require('../src/services/mathematical/verificationRegistry');

const statement = '∀ n : Nat, n + 0 = n';
const hash = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

async function fixture(authorityOverride, workflowOverride) {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    INSERT INTO workspaces VALUES ('workspace', 'org', 'project');
    CREATE TABLE agents (id TEXT PRIMARY KEY, workspace_id TEXT);
    INSERT INTO agents VALUES ('author', 'workspace');`);
  const receipts = new Map();
  const authority = authorityOverride || {
    async attest(input) {
      assert.equal(input.canonicalStatement, statement);
      assert.equal(hash(Buffer.from(input.source, 'utf8')), input.receipt.sourceDigest);
      receipts.set(`${input.receipt.receiptDigest}|${formatReference(input.ref)}`,
        { receipt: input.receipt, ref: input.ref });
    },
  };
  const store = createScientificReferenceStore({ verifyReceipt: async (digest, ref) =>
    receipts.get(`${digest}|${formatReference(ref)}`) });
  const workflow = createScientificWorkflow({ db, referenceStore: store });
  const producer = createScientificReferenceProducer({ authority,
    workflow: workflowOverride || workflow,
    organizationId: 'org', projectId: 'project', workspaceId: 'workspace',
    senderAgentId: 'author' });
  const gate = new LeanIncrementalGate({ graph: new MathematicalDependencyGraph(),
    executor: async () => ({ exitCode: 0, toolchainVersion: 'lean-test', axioms: [] }),
    toolchainVersion: 'lean-test', environmentDigest: hash('environment') });
  const runtime = createMathematicalOrganismRuntime({ leanGate: gate, scientificProducer: producer,
    budget: { tokens: 1000, cpu: 3600 } });
  runtime.initialize({ statement, domain: 'general' }, {
    initialNiches: [{ name: 'Test', representation: 'SAT' }],
    initialStrategies: [['induction']],
  });
  runtime.formalizationRegistry.add(createFormalizationArtifact({
    naturalStatement: statement, formalStatement: statement,
  }));
  return { db, runtime, store };
}

async function testPublication() {
  const { db, runtime, store } = await fixture();
  try {
    await runtime.step();
    const rows = await db.all(`SELECT object_id, content_bytes, receipt_digest, metadata_json
      FROM scientific_references`);
    assert.ok(rows.length > 0);
    assert.equal(rows.length, runtime.metrics.totalVerified);
    for (const row of rows) {
      assert.match(row.object_id, /^node-[a-f0-9]{64}$/);
      assert.ok(globalRegistry.isReceiptValid(row.receipt_digest));
      assert.match(row.content_bytes.toString('utf8'), /^theorem genos_target/);
      const resolved = await store.resolveReference(db, { ref: JSON.parse(row.metadata_json),
        requesterScope: { organizationId: 'org', projectId: 'project',
          workspaceId: 'workspace' } });
      assert.equal(resolved.content, row.content_bytes.toString('utf8'));
    }
    assert.ok(runtime.history.some((entry) => entry.event === 'step_complete'));
  } finally {
    await db.close();
    globalRegistry.clear();
  }
}

async function testAttestationFailure() {
  const { db, runtime } = await fixture({ attest: async () => {
    throw new Error('authority unavailable');
  } });
  try {
    await assert.rejects(() => runtime.step(), /authority unavailable/);
    const tables = await db.get(`SELECT count(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'scientific_references'`);
    assert.equal(tables.count, 0);
    assert.equal(runtime.culture.artifacts.size, 0);
    assert.equal(runtime.metrics.totalVerified, 0);
    assert.ok(runtime.history.some((entry) => entry.event === 'scientific_publication_failed'));
    assert.ok(!runtime.history.some((entry) => entry.event === 'step_complete'));
  } finally {
    await db.close();
    globalRegistry.clear();
  }
}

async function testPublicationFailure() {
  const { db, runtime } = await fixture(null, { publishVerified: async () => {
    throw new Error('publication transaction failed');
  } });
  try {
    await assert.rejects(() => runtime.run(1), /publication transaction failed/);
    assert.equal(runtime.running, false);
    assert.equal(runtime.culture.artifacts.size, 0);
    assert.equal(runtime.metrics.totalVerified, 0);
    const rows = await db.get(`SELECT count(*) AS count FROM sqlite_master
      WHERE type = 'table' AND name = 'scientific_references'`);
    assert.equal(rows.count, 0);
  } finally {
    await db.close();
    globalRegistry.clear();
  }
}

async function run() {
  await testPublication();
  await testAttestationFailure();
  await testPublicationFailure();
  console.log('Scientific reference producer: verified runtime publication and closed failure passed.');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
