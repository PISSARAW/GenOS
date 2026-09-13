const assert = require('assert');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const agentDna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');

const DNA_FILE = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');

async function testDecode() {
  const model = agentDna.decodeFile(DNA_FILE);
  assert.equal(model.format, 'AgentDNA/v1');
  assert.equal(model.contentHash.length, 64);
  assert.equal(model.meta.name, 'EvidenceLedger');
  assert.ok(model.genes.ROLE);
  assert.equal(model.genes.ROLE.instruction, 'historian');
  assert.equal(model.phenotype.role, 'historian');
  assert.ok(model.phenotype.tools.includes('genos_inspect'));
  assert.equal(model.plasmids.length, 0);
  console.log('AgentDNA decode checks passed.');
}

async function testExpressFallback() {
  const model = agentDna.decodeFile(DNA_FILE);
  const phenotype = agentDna.express({ ...model, phenotype: null });
  assert.equal(phenotype.role, 'historian');
  assert.ok(phenotype.tools.includes('genos_evidence_check'));
  assert.ok(phenotype.capabilities.length > 0);
  console.log('AgentDNA expression fallback checks passed.');
}

async function createSchema(db) {
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT NOT NULL, content_hash TEXT NOT NULL,
    genome_blob BLOB NOT NULL, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
}

async function testStore() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await createSchema(db);
  const model = agentDna.decodeFile(DNA_FILE);
  const saved = await store.saveGenome(db, model, { id: 'dna-evidence' });
  assert.equal(saved.name, 'EvidenceLedger');
  const loaded = await store.loadGenome(db, 'dna-evidence');
  assert.equal(loaded.meta.name, 'EvidenceLedger');
  assert.equal(loaded.contentHash, model.contentHash);
  const genes = await store.workerGenesForAssignment(db, { preferredName: 'EvidenceLedger' });
  assert.ok(genes.tools.includes('genos_inspect'));
  const missing = await store.workerGenesForAssignment(db, { preferredName: 'DoesNotExist' });
  assert.equal(missing, null);
  await db.close();
  console.log('AgentDNA persistence checks passed.');
}

async function testImport() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await createSchema(db);
  const directory = path.resolve(__dirname, '../../agents/dna/fondations');
  const stats = await store.importDirectory(db, directory, {});
  assert.ok(stats.imported > 0);
  assert.equal(stats.failed, 0);
  await db.close();
  console.log(`AgentDNA import checks passed (${stats.imported} genomes).`);
}

async function run() {
  await testDecode();
  await testExpressFallback();
  await testStore();
  await testImport();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
