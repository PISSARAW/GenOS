'use strict';
const c = require('./common.cjs');
async function auditRun(row, manifest) {
  const { open } = require('sqlite');
  const sqlite3 = require('sqlite3');
  const db = await open({ filename: c.path.join(row.directory, 'run.db'),
    driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try { return await auditDatabase(db, { row, manifest }); }
  finally { await db.close(); }
}
async function auditDatabase(db, input) {
  const { row, manifest } = input;
  const resultFile = c.path.join(row.directory, 'result.json');
  if (!c.fs.existsSync(resultFile)) return auditIncomplete(db, row);
  const result = c.read(resultFile);
  c.assert.ok(row.nativeRunId, 'A native run must exist');
  const authority = await c.service('missionEnvelopeAuthority').read(db, row.nativeRunId);
  c.assert.deepEqual(authority, result.authority, 'Authority or authenticated ledger changed');
  const agent = await db.get("SELECT * FROM agents WHERE id='benchmark-worker'");
  const scope = { organizationId: 'benchmark-org', projectId: 'benchmark-project' };
  const dnaRecord = c.service('workerDnaIncarnation').verifiedBinding(agent, scope);
  const genes = await c.service('workerDnaIncarnation').validateSource(db, { record: dnaRecord, scope });
  const model = c.service('agentDna').decodeFile(manifest.genomes[row.arm].file);
  c.assert.equal(model.meta.status, 'DRAFT');
  c.assert.equal(model.alphabet, 'ACGTPZBS');
  c.assert.equal(dnaRecord.contentHash, model.contentHash);
  c.assert.equal(genes.temp, model.phenotype.temp);
  const mission = c.read(c.path.join(row.directory, 'prepared-mission.json'));
  c.service('workerGenomeExpression').assertAuthority(authority.envelope,
    { ...mission, genome: genes, dnaIncarnation: dnaRecord });
  c.service('workerInferenceLimits').assertAuthority(authority.envelope, mission);
  const receiptRow = await db.get('SELECT * FROM biological_worker_receipts WHERE run_id=?', row.nativeRunId);
  const receipt = c.service('biologicalWorkerStore').verifiedJson(receiptRow, 'receipt_json');
  c.assert.equal(receipt.result.verified, row.nativeCompleted);
  const observations = await c.service('biologicalWorkerStore').observations(db, row.nativeRunId);
  c.assert.equal(c.service('biologicalIntegrity').digest(observations.map(r => r.hash)),
    c.service('biologicalIntegrity').digest(receipt.evidence.observations));
  const promotions = await db.get("SELECT count(*) AS count FROM agent_genome_innovations WHERE status='promoted'");
  c.assert.equal(promotions.count, 0);
  const turn = await db.get("SELECT * FROM organism_model_turns WHERE agent_id='benchmark-worker' AND status='completed'");
  c.assert.ok(turn, 'A persisted actual model turn is required');
  c.assert.equal(JSON.parse(turn.request_json).temperature, model.phenotype.temp);
  return { runId: row.runId, auditStatus: 'VERIFIED', authorityMac: 'verified', dnaBindingMac: 'verified',
    immutableObservations: observations.length, modelTurnId: turn.id,
    nativeVerified: receipt.result.verified, nativeReason: receipt.result.reason,
    genomePromotions: promotions.count };
}
async function auditIncomplete(db, row) {
  const run = await db.get("SELECT id,status FROM strategy_execution_runs WHERE agent_id='benchmark-worker' ORDER BY rowid DESC LIMIT 1");
  const promotions = await db.get("SELECT count(*) AS count FROM agent_genome_innovations WHERE status='promoted'");
  c.assert.equal(row.budgetValid, false);
  c.assert.equal(promotions.count, 0);
  return { runId: row.runId, auditStatus: 'INCOMPLETE_NATIVE_EXECUTION',
    processExitCode: row.processExitCode, processError: row.processError,
    nativeRunId: run?.id ?? null, nativeRunStatus: run?.status ?? null,
    nativeVerified: null, genomePromotions: promotions.count };
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const directory = c.inside(archive, 'verifications/native-audit-' + Date.now());
  c.fs.mkdirSync(directory, { recursive: true });
  c.setup(directory);
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  for (const [file, sha] of Object.entries(manifest.scripts)) {
    c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'scripts', file)), sha);
  }
  const data = c.read(c.path.join(archive, 'results.json'));
  c.assert.equal(data.rows.length, 18);
  const rows = [];
  for (const row of data.rows) {
    c.assert.equal(row.directory, c.inside(archive, 'runs/' + row.runId));
    rows.push(await auditRun(row, manifest));
  }
  const original = c.read('D:/GenOS-Experiments/local-code-temp-20261104/archive/pilot-1793787027905/manifest.json');
  c.assert.equal(c.fileHash(c.path.join(c.LIVE, 'agents/dna/integration/local_code_worker.dna')),
    original.canonicalSourceGenomeSha256);
  const status = rows.every(row => row.auditStatus === 'VERIFIED') ? 'PASS' : 'INCOMPLETE';
  c.write(c.path.join(directory, 'audit.json'), { status, databaseMode: 'READONLY',
    auditSourceSha256: c.fileHash(__filename), manifestHash: manifest.manifestHash,
    promotionAllowed: false, canonicalGenomeUnchanged: true, rows });
  console.log(JSON.stringify({ status, directory, runs: rows.length }));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { auditRun };
