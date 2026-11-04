'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const dna = require('../src/services/agentDna');
const store = require('../src/services/agentDnaStore');
const packing = require('../src/services/agentDna/packing');
const { resolveGenosBin } = require('../src/services/genosCliEnv');
const resident = require('../src/services/daemon/residentDaemonRuntime');

const root = path.resolve(__dirname, '../..');

function cli(args) {
  const result = spawnSync(resolveGenosBin(), ['genome', ...args],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

function compileManifest(directory, manifest) {
  const file = path.join(directory, path.basename(manifest) + '.dna');
  const response = cli(['compile', '--in', path.join(root, manifest), '--out', file]);
  assert.equal(response.format, 'AgentDNA/v2');
  const model = dna.decodeFile(file);
  assert.equal(model.alphabet, 'ACGTPZBS');
  assert.equal(model.maternal.bitsPerBase, 3);
  assert.ok(Object.values(model.genes).every(gene => gene.bitsPerBase === 3));
  assert.equal(cli(['validate', '--file', file]).status, 'VALID');
  const inspection = cli(['inspect', '--file', file]);
  assert.equal(inspection.content_hash, model.contentHash);
  assert.equal(inspection.strands.maternal.sequence, model.maternal.sequence);
  return { model, file };
}

async function createDatabase() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE agent_genomes (
    id TEXT PRIMARY KEY, agent_id TEXT, name TEXT, content_hash TEXT, genome_blob BLOB,
    phenotype_blob BLOB, source_manifest TEXT, source_doc TEXT, organization_id TEXT,
    project_id TEXT, status TEXT DEFAULT 'active', concept TEXT, updated_at TEXT)`);
  return db;
}

async function verifySelection(db, model) {
  await store.saveGenome(db, model, { id: model.meta.name });
  const selected = await store.workerGenesForAssignment(db, { genomeRef: model.meta.name });
  assert.equal(selected.genomeFormat, 'AgentDNA/v2');
  assert.equal(selected.genomeAlphabet, 'ACGTPZBS');
  assert.equal(selected.genes.role, model.phenotype.role);
  assert.deepEqual(selected.genes.tools, model.phenotype.tools);
}

async function verifyDaemon(model) {
  const runtime = resident.createRuntime(null, { genomeDna: model.raw });
  const registered = await resident.registerDaemon(runtime, { daemonId: 'h8-daemon', territoryId: 'h8-territory' });
  assert.equal(registered.registered, true);
  assert.equal(registered.genomeBinding.alphabet, 'ACGTPZBS');
  assert.equal(registered.genomeBinding.contentHash, model.contentHash);
  const state = await resident.getDaemonState(runtime, { daemonId: 'h8-daemon' });
  assert.deepEqual(state.genomeBinding, registered.genomeBinding);
}

function verifyMutation(directory, source) {
  const file = path.join(directory, 'mutant.dna');
  const original = source.model.genes.ROLE;
  const base = original.instruction === '' ? 'P' : 'S';
  cli(['point-mutate', '--in', source.file, '--out', file, '--locus', 'ROLE', '--position', '0', '--base', base]);
  const model = dna.decodeFile(file);
  assert.equal(model.format, 'AgentDNA/v2');
  assert.equal(model.provenance.mutations.at(-1).to, base);
  assert.notEqual(model.contentHash, source.model.contentHash);
  assert.equal(dna.decodeFile(source.file).contentHash, source.model.contentHash);
}

function verifyDowngrade(model) {
  const raw = Buffer.from(model.raw);
  raw.writeUInt16LE(1, 4);
  raw.writeUInt32LE(zlib.crc32(raw.subarray(0, 20)) >>> 0, 20);
  assert.throws(() => dna.decodeBuffer(raw), /require AgentDNA v2/);
  assert.equal(packing.unpackBases(Buffer.from([0x05, 0x39, 0x77]), 0x80000008), 'ACGTPZBS');
  assert.throws(() => packing.unpackBases(Buffer.from([1]), 0x80000001), /padding/);
  assert.throws(() => packing.decodeInstruction(Buffer.alloc(0), 0x80000003), /length/);
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-hachimoji-'));
  const db = await createDatabase();
  try {
    const worker = compileManifest(directory, 'agents/fondations/preuve_evidence.agent.json');
    const daemon = compileManifest(directory, 'agents/daemons/resident_daemon.agent.json');
    const orchestrator = compileManifest(directory, 'agents/biomimetique/holobionte_host_orchestrator.agent.json');
    await verifySelection(db, worker.model);
    await verifySelection(db, orchestrator.model);
    await verifyDaemon(daemon.model);
    verifyMutation(directory, worker);
    verifyDowngrade(worker.model);
    assert.throws(() => resident.createRuntime(null, { genomeDna: worker.model.raw }), /role mismatch/);
    const legacyPath = path.join(__dirname, 'fixtures/agent-dna-v1/preuve_evidence.dna');
    const legacy = dna.decodeFile(legacyPath);
    assert.equal(legacy.format, 'AgentDNA/v1');
    assert.equal(cli(['inspect', '--file', legacyPath]).content_hash, legacy.contentHash);
    assert.equal(legacy.phenotype.role, worker.model.phenotype.role);
    assert.deepEqual(legacy.phenotype.tools, worker.model.phenotype.tools);
  } finally {
    await db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  console.log('Hachimoji runtime: Rust/Node parity, legacy, selection, daemon binding, mutation and downgrade checks passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
