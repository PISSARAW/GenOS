'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= crypto.randomBytes(32).toString('hex');
const { evaluateReportWithAeis } = require('../../backend/src/services/epistemic/aeisPromotionBridge');

function benchmarkCases(root) {
  const first = path.join(root, 'replica-a');
  const second = path.join(root, 'replica-b');
  fs.mkdirSync(first);
  fs.mkdirSync(second);
  const replicas = { proof: { cwd: first }, source: { cwd: second } };
  return [
    { id: 'supported', expected: true, claim: { statement: 'echo 4 outputs "4"',
      test: { command: 'echo 4', expectOutput: '4', replicas } } },
    { id: 'contradicted', expected: false, claim: { statement: 'echo 4 outputs "5"',
      test: { command: 'echo 4', expectOutput: '5', replicas } } },
    { id: 'unrelated', expected: false, claim: { statement: '2 + 2 = 5',
      test: { command: 'echo 4', expectOutput: '4', replicas } } },
    { id: 'unconfined', expected: false, claim: { statement: 'echo 4 outputs "4"',
      test: { command: 'echo 4', expectOutput: '4', replicas: {
        proof: { cwd: os.tmpdir() }, source: { cwd: second },
      } } } },
  ];
}

function summarize(rows) {
  const count = (expected, actual) => rows.filter((row) => row.expected === expected && row.actual === actual).length;
  return {
    schema: 'genos.aeis-eab/v1', benchmark: 'AEIS promotion adversarial fixtures',
    cases: rows.length, trueAccepts: count(true, true), falseAccepts: count(false, true),
    trueRefusals: count(false, false), falseRefusals: count(true, false),
    totalLatencyMs: rows.reduce((total, row) => total + row.latencyMs, 0),
    totalVerifierResults: rows.reduce((total, row) => total + row.verifierResults, 0),
    casesDetail: rows,
  };
}

async function measureCase(item, root) {
  const started = process.hrtime.bigint();
  const result = await evaluateReportWithAeis({ claims: [{ ...item.claim,
    evidence: [{ kind: 'reproducible_artifact' }] }] }, {
    domain: 'general', immuneMemory: [], allowedWorkspaceRoot: root,
  });
  const verifierResults = result.holobionteResults.reduce((total, row) =>
    total + (row.immune?.verifierResults?.results?.length || 0), 0);
  return {
    id: item.id, expected: item.expected, actual: result.evaluation.eligible === true,
    latencyMs: Number(process.hrtime.bigint() - started) / 1e6, verifierResults,
    violations: result.evaluation.violations || [],
  };
}

async function run(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-aeis-eab-'));
  try {
    const rows = [];
    for (const item of benchmarkCases(root)) rows.push(await measureCase(item, root));
    const report = summarize(rows);
    assert.equal(report.trueAccepts, 1, 'AEIS must accept the supported claim');
    assert.equal(report.falseAccepts, 0, 'AEIS must reject every adversarial claim');
    assert.equal(report.falseRefusals, 0, 'AEIS must not reject the supported claim');
    if (options.out) fs.writeFileSync(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (require.main === module) {
  const outIndex = process.argv.indexOf('--out');
  run({ out: outIndex < 0 ? null : process.argv[outIndex + 1] })
    .then((report) => process.stdout.write(`${JSON.stringify(report)}\n`))
    .catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
}

module.exports = { run, summarize };
