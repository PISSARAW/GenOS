'use strict';
const c = require('./common.cjs');
const execution = require('./execution.cjs');
function assertRequest(input) {
  const { body, expected, genome } = input;
  c.assert.deepEqual(body, expected, 'Recorded request differs from preregistered genome expression');
  c.assert.equal(body.options.temperature, genome.phenotype.temp);
  c.assert.equal(body.options.top_p, 0.9);
  c.assert.equal(body.options.num_predict, 1536);
  c.assert.equal(body.options.num_ctx, 8192);
}
function verifyPins(manifest) {
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  c.assert.deepEqual(c.sources(), manifest.scripts);
  for (const genome of Object.values(manifest.genomes)) c.assert.equal(c.fileHash(genome.file), genome.sha256);
  for (const [file, sha] of Object.entries(manifest.sourceFiles)) {
    c.assert.equal(c.fileHash(c.path.join(c.SOURCE, 'backend/src/services', file)), sha);
  }
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/full-source.tar')), manifest.runtimeArchiveSha256);
  c.assert.equal(c.fileHash(c.path.join(c.ROOT, 'runtime/genos.exe')), manifest.nativeBinarySha256);
  c.assert.equal(c.fileHash(c.path.join(c.LIVE, 'agents/dna/integration/local_code_worker.dna')), manifest.canonicalSourceGenomeSha256);
  c.assert.equal(manifest.promotionAllowed, false);
}
function replayCandidate(input) {
  const { row, verification } = input;
  if (!row.admitted) return { runId: row.runId, admitted: false, failureRetained: true };
  const candidate = c.path.join(row.directory, 'candidate.js');
  c.assert.equal(c.fileHash(candidate), row.candidateSha256);
  const copy = c.path.join(verification, row.runId + '.js');
  c.fs.copyFileSync(candidate, copy, c.fs.constants.COPYFILE_EXCL);
  const replay = execution.executeOracle(copy, row.caseId);
  c.assert.deepEqual(replay.score, row.oracle.score, 'Oracle replay mismatch');
  c.assert.equal(replay.exitCode, row.oracle.exitCode);
  c.write(c.path.join(verification, row.runId + '-oracle.json'), replay);
  const executor = c.read(c.path.join(row.directory, 'executor.json'));
  c.assert.equal(row.executorPassed, executor.testStatus === 'passed');
  c.assert.equal(row.quality.passed, replay.score.passed);
  c.assert.equal(row.quality.allPassed, row.executorPassed && row.budgetValid && replay.score.allPassed);
  c.assert.equal(c.fileHash(c.path.join(row.directory, 'workspace/module.js')), row.finalWorkspaceSha256);
  return { runId: row.runId, admitted: true, passed: replay.score.passed, total: replay.score.total };
}
function verifyRun(input) {
  const { row, manifest, verification } = input;
  const planned = manifest.runs.find(r => r.runId === row.runId);
  for (const key of Object.keys(planned)) c.assert.equal(row[key], planned[key]);
  c.assert.deepEqual(row, c.read(c.path.join(row.directory, 'result.json')));
  c.assert.deepEqual(row.budget, manifest.budget);
  c.assert.equal(row.promotionAllowed, false);
  const genome = c.service('agentDna').decodeFile(manifest.genomes[row.arm].file);
  c.assert.equal(row.genomeHash, genome.contentHash);
  const task = manifest.cases.find(t => t.id === row.caseId);
  const body = c.read(c.path.join(row.directory, 'request.json'));
  const expected = execution.requestBody(genome, task, planned);
  assertRequest({ body, expected, genome });
  c.assert.equal(c.hash(JSON.stringify(body)), row.requestHash);
  c.assert.equal(c.hash(JSON.stringify(body.messages)), row.promptHash);
  if (row.usage) {
    const response = c.read(c.path.join(row.directory, 'response.json'));
    c.assert.equal(row.usage.inputTokens, response.prompt_eval_count);
    c.assert.equal(row.usage.outputTokens, response.eval_count);
    c.assert.equal(row.usage.totalTokens, response.eval_count + response.prompt_eval_count);
  }
  return replayCandidate({ row, verification });
}
function verifyPairs(input) {
  const { data, manifest } = input;
  c.assert.equal(data.completed, manifest.runs.length);
  c.assert.equal(new Set(data.results.map(r => r.runId)).size, manifest.runs.length);
  for (const pairId of new Set(manifest.runs.map(r => r.pairId))) {
    const rows = data.results.filter(r => r.pairId === pairId);
    c.assert.equal(rows.length, 2);
    c.assert.equal(rows[0].promptHash, rows[1].promptHash);
    c.assert.equal(rows[0].initialWorkspaceSha256, rows[1].initialWorkspaceSha256);
    c.assert.equal(rows[0].seed, rows[1].seed);
    c.assert.deepEqual(rows[0].budget, rows[1].budget);
  }
}
function tamperProbe(manifest) {
  const run = manifest.runs[0], genome = c.service('agentDna').decodeFile(manifest.genomes[run.arm].file);
  const task = manifest.cases.find(t => t.id === run.caseId);
  const expected = execution.requestBody(genome, task, run);
  const body = structuredClone(expected);
  body.options.temperature = 0.99;
  c.assert.throws(() => assertRequest({ body, expected, genome }));
  return { alteredTemperatureRejected: true };
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const verification = c.inside(archive, 'verifications/replay-' + Date.now());
  c.fs.mkdirSync(verification, { recursive: true });
  c.setup(verification);
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  verifyPins(manifest);
  const data = c.read(c.path.join(archive, 'results.json'));
  c.assert.equal(data.manifestHash, manifest.manifestHash);
  verifyPairs({ data, manifest });
  const rows = data.results.map(row => verifyRun({ row, manifest, verification }));
  c.assert.deepEqual(c.read(c.path.join(archive, 'model-before.json')), manifest.model);
  c.assert.deepEqual(c.read(c.path.join(archive, 'model-after.json')), manifest.model);
  const result = { status: 'PASS', verifiedAt: new Date().toISOString(), manifestHash: manifest.manifestHash,
    model: await c.modelIdentity(), promotionAllowed: false, fullWorkerMissionReceipts: false,
    tamperProbe: tamperProbe(manifest), rows, checks: 'Pinned scripts/runtime/genomes, 18 requests, nine paired prompts/budgets/seeds, real usage, independent oracle replay; no inference during replay' };
  c.write(c.path.join(verification, 'verification.json'), result);
  console.log(JSON.stringify({ status: result.status, verification, runs: rows.length }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
