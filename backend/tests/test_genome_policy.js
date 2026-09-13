const assert = require('assert');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const agentDna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const policy = require('../src/services/agentDnaPolicy');

const DNA_FILE = path.resolve(__dirname, '../../agents/dna/fondations/preuve_evidence.dna');

async function createSchema(db) {
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT NOT NULL, content_hash TEXT NOT NULL,
    genome_blob BLOB NOT NULL, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE genome_policies (
    organization_id TEXT NOT NULL, project_id TEXT NOT NULL,
    require_signed INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (organization_id, project_id));`);
}

async function run() {
  delete process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED;
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await createSchema(db);
  await store.saveGenome(db, agentDna.decodeFile(DNA_FILE), { id: 'EvidenceLedger' });

  const scope = { organizationId: 'org1', projectId: 'proj1' };
  assert.equal(await policy.isSignatureRequired(db, scope), false);
  await policy.setPolicy(db, scope, true);
  assert.equal(await policy.isSignatureRequired(db, scope), true);
  assert.equal((await policy.getPolicy(db, scope)).requireSigned, true);

  const rejected = await store.selectGenome(db, { genomeRef: 'EvidenceLedger' }, scope);
  assert.equal(rejected, null);
  const allowed = await store.selectGenome(db, { genomeRef: 'EvidenceLedger' }, { organizationId: 'org2', projectId: 'proj2' });
  assert.ok(allowed);

  await db.close();
  console.log('Genome policy checks passed.');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
