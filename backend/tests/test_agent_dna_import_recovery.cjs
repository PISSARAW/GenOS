'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const store = require('../src/services/agentDnaStore');
const dna = require('../src/services/agentDna');

async function database() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT, content_hash TEXT,
    genome_blob BLOB, phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT,
    organization_id TEXT, project_id TEXT, status TEXT, concept TEXT,
    updated_at TEXT);`);
  return db;
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-dna-import-'));
  const previous = { enabled: process.env.GENOS_AGENT_DNA, directory: process.env.GENOS_AGENT_DNA_DIR };
  const first = await database();
  const second = await database();
  try {
    process.env.GENOS_AGENT_DNA = '0';
    process.env.GENOS_AGENT_DNA_DIR = directory;
    await store.ensureImported(first);
    process.env.GENOS_AGENT_DNA = '1';
    await store.ensureImported(first);
    assert.equal((await first.get('SELECT count(*) count FROM agent_genomes')).count, 0);
    const source = path.resolve(__dirname, '../../agents/dna/biomimetique/biome_population_specialist.dna');
    await fs.copyFile(source, path.join(directory, 'biome.dna'));
    await store.ensureImported(first);
    await store.ensureImported(second);
    for (const db of [first, second]) {
      const row = await db.get('SELECT * FROM agent_genomes');
      assert.ok(row, 'Each database must persist its own imported genome.');
      assert.equal(dna.decodeBuffer(Buffer.from(row.genome_blob)).contentHash, row.content_hash);
    }
    console.log('AgentDNA import: disabled/empty catalog recovery and independent database persistence passed.');
  } finally {
    await first.close(); await second.close();
    if (previous.enabled === undefined) delete process.env.GENOS_AGENT_DNA;
    else process.env.GENOS_AGENT_DNA = previous.enabled;
    if (previous.directory === undefined) delete process.env.GENOS_AGENT_DNA_DIR;
    else process.env.GENOS_AGENT_DNA_DIR = previous.directory;
    if (path.dirname(directory) !== path.resolve(os.tmpdir())) throw new Error('Unexpected cleanup path');
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
