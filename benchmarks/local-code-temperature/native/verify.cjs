'use strict';
const c = require('./common.cjs');
const metrics = require('./metrics.cjs');
const { assertManifest } = require('./campaign.cjs');
const execution = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/execution.cjs');
function verifyTrace(input) {
  const { row, manifest } = input;
  const traces = metrics.provider(row.directory);
  c.assert.equal(traces.length, row.providerCalls);
  c.assert.deepEqual(metrics.usageOf(traces), row.usage);
  for (const trace of traces) {
    c.assert.equal(trace.request.model, c.CONFIG.model);
    c.assert.equal(trace.request.options.temperature, manifest.genomes[row.arm].phenotype.temp);
    c.assert.equal(trace.request.options.top_p, 0.9);
    c.assert.equal(trace.request.options.num_ctx, 8192);
    c.assert.equal(trace.request.options.num_predict, 1536);
    c.assert.equal(trace.request.options.seed, row.seed);
  }
}
function replay(input) {
  const { row, verification } = input;
  const result = c.read(c.path.join(row.directory, 'result.json'));
  c.assert.equal(result.genomePromotions, 0);
  if (!result.oracle) return { runId: row.runId, replay: 'not-available', refusalRetained: true };
  const candidate = c.path.join(row.directory, 'workspace/module.js');
  const copy = c.path.join(verification, row.runId + '.js');
  c.fs.copyFileSync(candidate, copy, c.fs.constants.COPYFILE_EXCL);
  const oracle = execution.executeOracle(copy, row.caseId);
  c.assert.deepEqual(oracle.score, result.oracle.score);
  c.assert.equal(oracle.exitCode, result.oracle.exitCode);
  c.write(c.path.join(verification, row.runId + '-oracle.json'), oracle);
  const authority = result.authority?.envelope;
  if (authority) {
    const mission = c.read(c.path.join(row.directory, 'prepared-mission.json'));
    c.service('workerInferenceLimits').assertAuthority(authority, mission);
    const mutant = structuredClone(mission);
    mutant.executionPolicy.inferenceLimits.attempts = 2;
    c.assert.throws(() => c.service('workerInferenceLimits').assertAuthority(authority, mutant),
      { code: 'EXECUTION_AUTHORITY_CONTEXT_CHANGED' });
    c.assert.equal(authority.executable.sha256, c.fileHash(authority.executable.path));
  }
  return { runId: row.runId, assertions: oracle.score.passed, authoritySealed: Boolean(authority),
    nativeVerified: result.nativeReceipt?.result?.verified === true };
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  assertManifest(manifest);
  const data = c.read(c.path.join(archive, 'results.json'));
  c.assert.equal(data.rows.length, 18);
  c.assert.equal(new Set(data.rows.map(r => r.runId)).size, 18);
  c.assert.deepEqual(metrics.summary(data.rows), data.summary);
  const verification = c.inside(archive, 'verifications/replay-' + Date.now());
  c.fs.mkdirSync(verification, { recursive: true });
  c.setup(verification);
  const rows = [];
  for (const row of data.rows) {
    const planned = manifest.runs.find(r => r.runId === row.runId);
    for (const key of Object.keys(planned)) c.assert.equal(row[key], planned[key]);
    c.assert.deepEqual(row.budget, manifest.budget);
    verifyTrace({ row, manifest });
    rows.push(replay({ row, verification }));
  }
  const before = c.read(c.path.join(archive, 'model-before.json'));
  const after = c.read(c.path.join(archive, 'model-after.json'));
  c.assert.deepEqual(before, manifest.identity);
  c.assert.deepEqual(after, manifest.identity);
  c.write(c.path.join(verification, 'verification.json'), { status: 'PASS',
    manifestHash: manifest.manifestHash, promotionAllowed: false, rows,
    scope: 'All attempts retained, provider model/options/usage, summary, paired seeds/budgets/corpus, oracle replay and sealed inference-limit tampering. Native acceptance remains the actual stored outcome; PASS here never promotes or qualifies a genome.' });
  console.log(JSON.stringify({ status: 'PASS', verification, runs: rows.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
