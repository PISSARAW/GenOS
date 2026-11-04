'use strict';
const c = require('../oracle/common.cjs');
const { auditRun } = require('../native/audit-receipts.cjs');
const execution = require('D:/GenOS-Experiments/local-code-temp-20261104/scripts/execution.cjs');

function identityNeutral(messages) {
  return messages.map(message => ({ ...message, content: message.content
    .replace(/^(Continuité: GENESIS, révision \d+, incarnation )[a-f0-9-]{36}\.$/gm, '$1<identity-nonce>.')
    .replace(/^\[DOSSIER D'IDENTITÉ [a-f0-9]{12}\]$/gm, "[DOSSIER D'IDENTITÉ <identity-nonce>]") }));
}

function traces(row) {
  return c.fs.readdirSync(row.directory).filter(n => /^provider-\d+\.json$/.test(n))
    .map(n => c.read(c.path.join(row.directory, n)));
}

function verifyPair(rows) {
  if (rows.length !== 2) return { comparable: false, reason: 'global_deadline' };
  const [left, right] = rows.map(traces);
  if (left.length !== 1 || right.length !== 1) return { comparable: false, reason: 'incomplete_provider_trace' };
  const options = list => { const value = { ...list[0].request.options }; delete value.temperature; return value; };
  c.assert.deepEqual(options(left), options(right));
  c.assert.deepEqual(left[0].request.format, right[0].request.format);
  c.assert.deepEqual(identityNeutral(left[0].request.messages), identityNeutral(right[0].request.messages));
  return { comparable: true, optionsEqualExceptTemperature: true, promptsEqualExceptTwoNativeIdentityNonces: true };
}

function verifyRequest(row, manifest) {
  const list = traces(row);
  c.assert.equal(list.length, row.providerCalls);
  c.assert.deepEqual(require('../native/metrics.cjs').usageOf(list), row.usage);
  for (const trace of list) {
    c.assert.equal(trace.request.model, manifest.identity.name);
    c.assert.equal(trace.request.options.temperature, manifest.genomes[row.arm].phenotype.temp);
    c.assert.equal(trace.request.options.seed, row.seed);
    c.assert.equal(trace.request.options.top_p, 0.9);
    c.assert.equal(trace.request.options.num_ctx, 8192);
    c.assert.equal(trace.request.options.num_predict, 1536);
  }
}

async function verifyNative(input) {
  const { row, manifest, directory } = input;
  const audited = await auditRun(row, manifest);
  const resultFile = c.path.join(row.directory, 'result.json');
  if (!c.fs.existsSync(resultFile)) {
    c.assert.equal(row.qualified, false);
    return { ...audited, timeoutRetained: true };
  }
  const result = c.read(resultFile);
  c.assert.equal(row.qualified, Boolean(row.budgetValid && result.nativeReceipt?.result.verified
    && result.oracleInspection?.status === 'accepted_at_decision' && result.truthGate?.status === 'passed'));
  const sqlite3 = require('sqlite3');
  const db = await require('sqlite').open({ filename: c.path.join(row.directory, 'run.db'),
    driver: sqlite3.Database, mode: sqlite3.OPEN_READONLY });
  try {
    const proof = await c.service('epistemic/nativeOracleInspection').inspect(db, { runId: row.nativeRunId, agentId: 'benchmark-worker' });
    c.assert.equal(proof.status, result.oracleInspection.status);
    if (proof.status === 'accepted_at_decision') {
      c.assert.equal(proof.costs.processes, 2);
      c.assert.equal(proof.costs.complete, true);
    }
    const graph = await c.service('reportCompilerService').buildTruthGraph(db, 'benchmark-root', { missionId: 'temperature-mission' });
    c.assert.deepEqual(graph, c.read(c.path.join(row.directory, 'truth-graph.json')));
    const mission = c.read(c.path.join(row.directory, 'prepared-mission.json'));
    const mutant = structuredClone(mission);
    mutant.workerAssignment.workspaceVerificationContract.caseId = 'invented';
    const binding = await c.service('biologicalWorkerStore').binding(db, row.nativeRunId);
    c.assert.throws(() => c.service('epistemic/workspaceVerificationContract').assertMatches(binding.genome.workerContract, mutant),
      { code: 'WORKSPACE_VERIFICATION_CONTRACT_MISMATCH' });
    c.assert.equal(result.genomePromotions, 0);
    return { ...audited, oracleStatus: proof.status, truthGraph: graph.status, qualified: row.qualified,
      historicalProofCurrentValidity: proof.current || null };
  } finally { await db.close(); }
}

function replay(row, directory) {
  const file = c.path.join(row.directory, 'result.json');
  if (!c.fs.existsSync(file)) return 'timeout_retained';
  const result = c.read(file);
  if (!result.oracle) return 'refusal_retained';
  const copy = c.path.join(directory, row.runId + '.js');
  c.fs.copyFileSync(c.path.join(row.directory, 'workspace/module.js'), copy, c.fs.constants.COPYFILE_EXCL);
  const oracle = execution.executeOracle(copy, row.caseId);
  c.assert.deepEqual(oracle.score, result.oracle.score);
  c.assert.equal(oracle.exitCode, result.oracle.exitCode);
  c.write(c.path.join(directory, row.runId + '-oracle.json'), oracle);
  return 'reproduced';
}

async function main() {
  const archive = c.path.resolve(process.argv[2]);
  c.assert.ok(archive.startsWith(c.path.join(c.ROOT, 'archive') + c.path.sep));
  const directory = c.inside(archive, 'verifications/independent-' + Date.now());
  c.fs.mkdirSync(directory, { recursive: true });
  c.setup(directory);
  const manifest = c.read(c.path.join(archive, 'manifest.json'));
  const { manifestHash, ...body } = manifest;
  c.assert.equal(c.hash(JSON.stringify(body)), manifestHash);
  const data = c.read(c.path.join(archive, 'results.json'));
  const ended = c.read(c.path.join(archive, 'campaign-end.json'));
  c.assert.ok(ended.elapsedMs <= 1500000);
  c.assert.equal(data.promotionAllowed, false);
  c.assert.deepEqual(data.summary, require('../native/metrics.cjs').summary(data.rows));
  const rows = [];
  for (const row of data.rows) {
    const planned = manifest.runs.find(run => run.runId === row.runId);
    for (const key of Object.keys(planned)) c.assert.equal(row[key], planned[key]);
    c.assert.deepEqual(row.budget, manifest.budget);
    verifyRequest(row, manifest);
    rows.push({ ...await verifyNative({ row, manifest, directory }), replay: replay(row, directory) });
  }
  const pairs = [...new Set(manifest.runs.map(run => run.pairId))].map(pairId =>
    ({ pairId, ...verifyPair(data.rows.filter(row => row.pairId === pairId)) }));
  const original = c.read('D:/GenOS-Experiments/local-code-temp-20261104/archive/pilot-1793787027905/manifest.json');
  c.assert.equal(c.fileHash(c.path.join(c.LIVE, 'agents/dna/integration/local_code_worker.dna')), original.canonicalSourceGenomeSha256);
  c.assert.deepEqual(c.read(c.path.join(archive, 'model-before.json')), manifest.identity);
  c.assert.deepEqual(c.read(c.path.join(archive, 'model-after.json')), manifest.identity);
  const status = data.rows.length === 18 && rows.every(row => !row.timeoutRetained) ? 'PASS' : 'INCOMPLETE_WITH_FAILURES_RETAINED';
  c.write(c.path.join(directory, 'verification.json'), { status, manifestHash, sourceSha256: c.fileHash(__filename),
    promotionAllowed: false, canonicalGenomeUnchanged: true, elapsedMs: ended.elapsedMs, rows, pairs });
  console.log(JSON.stringify({ status, directory, rows: rows.length }));
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
