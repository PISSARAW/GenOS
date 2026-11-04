'use strict';
const c = require('./common.cjs');
const metrics = require('./metrics.cjs');
function assertManifest(manifest) {
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  c.assert.deepEqual(c.sources(), manifest.scripts);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/source-limits.tar')), manifest.sourceArchiveSha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/inference-transport.tar')), manifest.sourceOverlay.sha256);
  for (const genome of Object.values(manifest.genomes)) c.assert.equal(c.fileHash(genome.file), genome.sha256);
}
function execute(manifest, run) {
  assertManifest(manifest);
  const directory = c.inside(manifest.archive, 'runs/' + run.runId);
  c.fs.mkdirSync(directory, { recursive: true });
  const input = { directory, run, task: manifest.cases.find(t => t.id === run.caseId),
    genomeFile: manifest.genomes[run.arm].file };
  const file = c.path.join(directory, 'input.json');
  c.write(file, input);
  const started = performance.now();
  const log = c.fs.openSync(c.path.join(directory, 'process.log'), 'wx');
  const result = c.cp.spawnSync(process.execPath, [c.path.join(__dirname, 'worker-run.cjs'), file],
    { cwd: c.SOURCE, stdio: ['ignore', log, log], timeout: 120000, windowsHide: true });
  c.fs.closeSync(log);
  return metrics.score({ manifest, run, directory, wallMs: performance.now() - started, processResult: result });
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  assertManifest(manifest);
  c.write(c.path.join(archive, 'model-before.json'), await c.modelIdentity());
  const warmup = await c.api('/api/chat', { model: c.CONFIG.model, stream: false,
    keep_alive: '20m', messages: [{ role: 'user', content: 'Ready' }], options: { num_predict: 1, num_ctx: 8192 } }, 120000);
  c.write(c.path.join(archive, 'warmup.json'), { excludedFromMeasurement: true, ...warmup });
  const started = Date.now(), rows = [];
  for (const run of manifest.runs) {
    if (Date.now() - started + 120000 > manifest.campaignWallLimitMs) {
      c.write(c.path.join(archive, 'campaign-limit.json'), { pending: manifest.runs.slice(rows.length) });
      break;
    }
    const row = execute(manifest, run);
    rows.push(row);
    console.log(JSON.stringify({ runId: row.runId, calls: row.providerCalls, tokens: row.usage?.totalTokens,
      assertions: row.assertionsPassed, native: row.nativeStatus, failure: row.failure?.code, ms: Math.round(row.wallMs) }));
  }
  c.write(c.path.join(archive, 'model-after.json'), await c.modelIdentity());
  c.write(c.path.join(archive, 'results.json'), { manifestHash: manifest.manifestHash, promotionAllowed: false,
    planned: manifest.runs.length, completed: rows.length, rows, summary: metrics.summary(rows) });
  require('./report.cjs').report(archive);
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { assertManifest };
