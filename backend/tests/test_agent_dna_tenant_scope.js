'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const agentDna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const operations = require('../src/services/agentDnaOperations');

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function createSchema(db) {
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT NOT NULL, content_hash TEXT NOT NULL,
    genome_blob BLOB NOT NULL, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT, status TEXT NOT NULL DEFAULT 'active', concept TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
}

async function verifyApiScope(db, model) {
  const dbModule = require('../src/db');
  const originalGetDatabase = dbModule.getDatabase;
  dbModule.getDatabase = async () => db;
  delete require.cache[require.resolve('../src/controllers/genomeController')];
  const controller = require('../src/controllers/genomeController');
  try {
    await store.saveGenome(db, model, { id: 'secret-b', organizationId: 'org-b', projectId: 'project-b' });
    const hidden = response();
    await controller.getGenome({ params: { id: 'secret-b' }, tenant: { organizationId: 'org-a', projectId: 'project-a' } }, hidden, (error) => { throw error; });
    assert.equal(hidden.statusCode, 404);
    assert.equal(await store.selectGenome(db, { preferredName: model.meta.name }, { organizationId: 'org-a', projectId: 'project-a' }), null);

    await store.saveGenome(db, model, { id: 'global-genome' });
    const shared = response();
    await controller.getGenome({ params: { id: 'global-genome' }, tenant: { organizationId: 'org-a', projectId: 'project-a' } }, shared, (error) => { throw error; });
    assert.equal(shared.statusCode, 200);
    assert.equal(shared.body.genome.name, model.meta.name);

    const listed = response();
    await controller.listGenomes({ tenant: { organizationId: 'org-a', projectId: 'project-a' } }, listed, (error) => { throw error; });
    assert.deepEqual(listed.body.genomes.map((genome) => genome.id), ['global-genome']);
  } finally {
    dbModule.getDatabase = originalGetDatabase;
  }
}

async function verifyConflictProtection(db, model) {
  await store.saveGenome(db, model, { id: 'stable-id', organizationId: 'org-b', projectId: 'project-b' });
  await assert.rejects(
    store.saveGenome(db, model, { id: 'stable-id', organizationId: 'org-a', projectId: 'project-a' }),
    (error) => error.code === 'GENOME_SCOPE_CONFLICT'
  );
  const row = await db.get('SELECT organization_id, project_id FROM agent_genomes WHERE id = ?', 'stable-id');
  assert.deepEqual(row, { organization_id: 'org-b', project_id: 'project-b' });
}

async function verifyOperationScope(db) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-dna-scope-'));
  const target = path.join(directory, 'genome.dna');
  try {
    await assert.rejects(
      operations.materialize(db, 'secret-b', { targetPath: target, scope: { organizationId: 'org-a', projectId: 'project-a' } }),
      (error) => error.code === 'GENOME_NOT_FOUND'
    );
    assert.equal(fs.existsSync(target), false);
    await operations.materialize(db, 'global-genome', { targetPath: target, scope: { organizationId: 'org-a', projectId: 'project-a' } });
    assert.equal(fs.existsSync(target), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function runTest() {
  const db = await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await createSchema(db);
    const dnaPath = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');
    const model = agentDna.decodeFile(dnaPath);
    await verifyApiScope(db, model);
    await verifyOperationScope(db);
    await verifyConflictProtection(db, model);
  } finally {
    await db.close();
  }
}

runTest().then(() => console.log('AgentDNA tenant scope: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
