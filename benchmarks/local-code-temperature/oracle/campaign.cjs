'use strict';
const c = require('./common.cjs');
const metrics = require('../native/metrics.cjs');
function assertManifest(manifest) {
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  c.assert.deepEqual(c.sources(), manifest.scripts);
  for (const [file, hash] of Object.entries(manifest.historical)) c.assert.equal(c.fileHash(file), hash);
  for (const [file, hash] of Object.entries(manifest.provenance.criticalFiles)) c.assert.equal(c.fileHash(c.path.join(c.SOURCE, file)), hash);
  for (const genome of Object.values(manifest.genomes)) c.assert.equal(c.fileHash(genome.file), genome.sha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/source-limits.tar')), manifest.provenance.sourceArchiveSha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/repair-overlay.tar')), manifest.provenance.overlaySha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/inference-transport.tar')), manifest.provenance.transportOverlaySha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/genos.exe')), manifest.provenance.nativeBinarySha256);
}
async function assertFrozenSource(manifest) {
  const entries = Object.entries(manifest.provenance.files);
  let cursor = 0;
  await Promise.all(Array.from({ length: 32 }, async () => {
    while (cursor < entries.length) {
      const [file, hash] = entries[cursor++];
      c.assert.equal(c.hash(await c.fs.promises.readFile(c.path.join(c.SOURCE, file))), hash, file);
    }
  }));
}
function execute(manifest, run) {
  const started = performance.now();
  assertManifest(manifest);
  const directory = c.inside(manifest.archive, 'runs/' + run.runId);
  c.fs.mkdirSync(directory, { recursive: true });
  const file = c.path.join(directory, 'input.json');
  c.write(file, { directory, run, task: manifest.cases.find(t => t.id === run.caseId), genomeFile: manifest.genomes[run.arm].file });
  const log = c.fs.openSync(c.path.join(directory, 'process.log'), 'wx');
  const child = c.cp.spawnSync(process.execPath, [c.path.join(__dirname, 'worker-run.cjs'), file],
    { cwd: c.SOURCE, stdio: ['ignore', log, log], timeout: Math.max(1, 120000 - Math.ceil(performance.now() - started)), windowsHide: true });
  c.fs.closeSync(log);
  const row = metrics.score({ manifest, run, directory, wallMs: performance.now() - started, processResult: child });
  const resultFile = c.path.join(directory, 'result.json');
  const result = c.fs.existsSync(resultFile) ? c.read(resultFile) : {};
  row.oracleStatus = result.oracleInspection?.status || null;
  row.truthGate = result.truthGate?.status || null;
  row.qualified = row.budgetValid && row.nativeCompleted && row.oracleStatus === 'accepted_at_decision' && row.truthGate === 'passed';
  c.write(c.path.join(directory, 'qualification.json'), { ...row, promotionAllowed: false });
  return row;
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  assertManifest(manifest);
  await assertFrozenSource(manifest);
  c.write(c.path.join(archive, 'model-before.json'), await c.modelIdentity());
  const warmup = await c.api('/api/chat', { model: c.CONFIG.model, stream: false,
    keep_alive: '20m', messages: [{ role: 'user', content: 'Ready' }], options: { num_predict: 1, num_ctx: 8192 } }, 120000);
  c.write(c.path.join(archive, 'warmup.json'), { excludedFromMeasurement: true, ...warmup });
  const started = Date.now(), rows = [];
  c.write(c.path.join(archive, 'campaign-start.json'), { startedAt: new Date(started).toISOString(), deadline: new Date(started + 1500000).toISOString() });
  for (const run of manifest.runs) {
    if (Date.now() - started + 120000 > manifest.campaignWallLimitMs) {
      c.write(c.path.join(archive, 'campaign-limit.json'), { pending: manifest.runs.slice(rows.length) });
      break;
    }
    const row = execute(manifest, run);
    rows.push(row);
    console.log(JSON.stringify({ runId: row.runId, calls: row.providerCalls, tokens: row.usage?.totalTokens,
      assertions: row.assertionsPassed, oracle: row.oracleStatus, truth: row.truthGate, qualified: row.qualified, ms: Math.round(row.wallMs) }));
  }
  const ended = Date.now();
  c.write(c.path.join(archive, 'campaign-end.json'), { endedAt: new Date(ended).toISOString(), elapsedMs: ended - started });
  c.write(c.path.join(archive, 'model-after.json'), await c.modelIdentity());
  assertManifest(manifest);
  await assertFrozenSource(manifest);
  c.write(c.path.join(archive, 'source-integrity.json'), { status: 'unchanged', checkedFiles: Object.keys(manifest.provenance.files).length });
  c.write(c.path.join(archive, 'results.json'), { manifestHash: manifest.manifestHash, promotionAllowed: false,
    planned: manifest.runs.length, completed: rows.length, rows, summary: metrics.summary(rows) });
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { assertManifest };
