'use strict';
const c = require('./common.cjs');
const execution = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/execution.cjs');
function rawProvider(row) {
  const files = c.fs.readdirSync(row.directory).filter(n => /^provider-\d+\.json$/.test(n));
  return files.map(n => c.read(c.path.join(row.directory, n)));
}
function providerUsage(traces) {
  const finals = traces.flatMap(t => t.response.trim().split(/\r?\n/).map(JSON.parse))
    .filter(r => r.done === true);
  if (!finals.length) return null;
  const inputTokens = finals.reduce((sum, r) => sum + r.prompt_eval_count, 0);
  const outputTokens = finals.reduce((sum, r) => sum + r.eval_count, 0);
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, financialCostUsd: null };
}
function checkRow(input) {
  const { manifest, row, directory } = input;
  const run = manifest.runs.find(r => r.runId === row.runId);
  for (const key of Object.keys(run)) c.assert.equal(row[key], run[key]);
  c.assert.equal(row.directory, c.inside(manifest.archive, 'runs/' + row.runId));
  const prepared = c.read(c.path.join(row.directory, 'input.json'));
  c.assert.deepEqual(prepared.task, manifest.cases.find(t => t.id === row.caseId));
  c.assert.deepEqual(prepared.run, run);
  c.assert.deepEqual(row.budget, manifest.budget);
  const traces = rawProvider(row);
  c.assert.equal(traces.length, row.providerCalls);
  c.assert.deepEqual(providerUsage(traces), row.usage);
  for (const trace of traces) checkRequest({ trace, row, manifest });
  const resultFile = c.path.join(row.directory, 'result.json');
  if (!c.fs.existsSync(resultFile)) {
    c.assert.equal(row.budgetValid, false);
    c.assert.equal(row.assertionsPassed, 0);
    return { runId: row.runId, status: 'TIMEOUT_RETAINED', nativeProof: 'incomplete' };
  }
  return replayRow({ row, directory, result: c.read(resultFile) });
}
function checkRequest(input) {
  const { trace, row, manifest } = input;
  c.assert.equal(trace.request.model, manifest.identity.name);
  c.assert.equal(trace.request.options.temperature, manifest.genomes[row.arm].phenotype.temp);
  c.assert.equal(trace.request.options.top_p, 0.9);
  c.assert.equal(trace.request.options.num_ctx, 8192);
  c.assert.equal(trace.request.options.num_predict, 1536);
  c.assert.equal(trace.request.options.seed, row.seed);
}
function replayRow(input) {
  const { row, directory, result } = input;
  c.assert.equal(result.genomePromotions, 0);
  if (!result.oracle) {
    c.assert.equal(row.assertionsPassed, 0);
    return { runId: row.runId, status: 'REFUSAL_RETAINED' };
  }
  const copy = c.path.join(directory, row.runId + '.js');
  c.fs.copyFileSync(c.path.join(row.directory, 'workspace/module.js'), copy, c.fs.constants.COPYFILE_EXCL);
  const oracle = execution.executeOracle(copy, row.caseId);
  c.assert.deepEqual(oracle.score, result.oracle.score);
  c.assert.equal(oracle.exitCode, result.oracle.exitCode);
  if (!oracle.score) {
    c.assert.equal(oracle.stderr, result.oracle.stderr);
    c.assert.equal(row.assertionsPassed, 0);
    return { runId: row.runId, status: 'ORACLE_REFUSAL_REPRODUCED', reason: oracle.stderr.trim() };
  }
  c.assert.equal(oracle.score.passed, row.assertionsPassed);
  c.write(c.path.join(directory, row.runId + '-oracle.json'), oracle);
  return { runId: row.runId, status: 'REPRODUCED', assertions: oracle.score.passed,
    nativeVerified: row.nativeCompleted };
}
function checkPair(rows) {
  c.assert.equal(rows.length, 2);
  c.assert.equal(rows[0].seed, rows[1].seed);
  const left = rawProvider(rows[0]), right = rawProvider(rows[1]);
  if (left.length !== 1 || right.length !== 1) return { pairId: rows[0].pairId, comparable: false };
  const options = traces => { const value = { ...traces[0].request.options }; delete value.temperature; return value; };
  c.assert.deepEqual(options(left), options(right));
  c.assert.deepEqual(left[0].request.format, right[0].request.format);
  return { pairId: rows[0].pairId, providerOptionsEqualExceptTemperature: true,
    promptsEqualExcludingNativeIdentityNonces: c.hash(JSON.stringify(identityNeutral(left[0].request.messages)))
      === c.hash(JSON.stringify(identityNeutral(right[0].request.messages))),
    promptsExactlyEqual: c.hash(JSON.stringify(left[0].request.messages)) === c.hash(JSON.stringify(right[0].request.messages)) };
}
function identityNeutral(messages) {
  return messages.map(message => ({ ...message, content: message.content
    .replace(/^(Continuité: GENESIS, révision \d+, incarnation )[a-f0-9-]{36}\.$/gm, '$1<identity-nonce>.')
    .replace(/^\[DOSSIER D'IDENTITÉ [a-f0-9]{12}\]$/gm, "[DOSSIER D'IDENTITÉ <identity-nonce>]") }));
}
async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  const data = c.read(c.path.join(archive, 'results.json'));
  c.assert.equal(data.rows.length, 18);
  c.assert.equal(new Set(data.rows.map(r => r.runId)).size, 18);
  c.assert.equal(data.promotionAllowed, false);
  const directory = c.inside(archive, 'verifications/coherence-' + Date.now());
  c.fs.mkdirSync(directory, { recursive: true });
  const rows = data.rows.map(row => checkRow({ manifest, row, directory }));
  const pairs = [...new Set(manifest.runs.map(r => r.pairId))]
    .map(id => checkPair(data.rows.filter(r => r.pairId === id)));
  const interrupted = rows.filter(r => r.status === 'TIMEOUT_RETAINED').length;
  const result = { status: interrupted ? 'COHERENT_WITH_TIMEOUTS' : 'COHERENT',
    qualification: interrupted ? 'INCOMPLETE' : 'See actual native receipts', promotionAllowed: false,
    originalStrictVerifierIsNotOverridden: true, auditSourceSha256: c.fileHash(__filename),
    identityComparisonScope: 'Analysis only: two native identity nonce lines normalized; actual model requests remain unchanged',
    manifestHash, rows, pairs };
  c.write(c.path.join(directory, 'coherence.json'), result);
  console.log(JSON.stringify({ status: result.status, directory, interrupted, pairs: pairs.length }));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
