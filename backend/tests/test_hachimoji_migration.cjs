'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { resolveGenosBin } = require('../src/services/genosCliEnv');
const dna = require('../src/services/agentDna');
const { decodeContainer } = require('../src/services/agentDna/container');
const { unpackBases } = require('../src/services/agentDna/packing');
const { unpack } = require('msgpackr');
const qualification = require('../src/services/agentDna/hachimojiQualification');
const catalog = require('../src/services/agentDna/hachimojiCatalog');
const expression = require('../src/services/workerGenomeExpression');
const trust = require('../src/services/agentDnaTrust');
const workflow = require('../bin/migrate-agent-dna-hachimoji.cjs');

function cli(args, expected = 0) {
  const result = spawnSync(resolveGenosBin(), ['genome', ...args],
    { encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, expected, result.stderr || result.error?.message);
  return result;
}

function verifyExpression(before, after) {
  const lease = ['genos_test', 'genos_sandbox_exec', 'genos_inspect', 'genos_snapshot'];
  const mission = genes => expression.apply({ prompt: 'Corrige le bug.', toolLease: [...lease] }, genes);
  const original = mission(dna.workerGenes(before));
  const migrated = mission(dna.workerGenes(after));
  assert.equal(migrated.prompt, original.prompt);
  assert.deepEqual(migrated.toolLease, ['genos_test', 'genos_sandbox_exec']);
  assert.deepEqual(expression.samplingOptions(migrated), { temperature: 0.45, topP: 0.9 });
  assert.deepEqual(expression.authorityBinding(migrated), expression.authorityBinding(original));
}

function verifySignedRefusal(directory, source) {
  const key = path.join(directory, 'key');
  const signed = path.join(directory, 'signed.dna');
  const rejected = path.join(directory, 'forbidden.dna');
  cli(['keygen', '--output', key]);
  cli(['sign', '--input', source, '--output', signed, '--key', key]);
  assert.equal(dna.decodeFile(signed).signatureValid, true);
  cli(['migrate-hachimoji', '--input', signed, '--output', rejected], 1);
  assert.equal(fs.existsSync(rejected), false);
  const sealed = path.join(directory, 'sealed.dna');
  cli(['seal', '--input', source, '--output', sealed]);
  cli(['migrate-hachimoji', '--input', sealed, '--output', rejected], 1);
  assert.equal(fs.existsSync(rejected), false);
}

function verifyCorruption(directory, migrated) {
  const bytes = Buffer.from(migrated);
  bytes[bytes.length - 1] ^= 1;
  const corrupted = path.join(directory, 'corrupted.dna');
  fs.writeFileSync(corrupted, bytes);
  assert.throws(() => dna.decodeBuffer(bytes), /CRC/);
  cli(['validate', '--file', corrupted], 1);
  cli(['migrate-hachimoji', '--input', corrupted, '--output', path.join(directory, 'no.dna')], 1);
  assert.equal(fs.existsSync(path.join(directory, 'no.dna')), false);
}

function verifyInstructionDrift(directory, source, target) {
  const file = path.join(directory, 'instruction-drift.dna');
  cli(['point-mutate', '--input', target, '--output', file,
    '--locus', 'MODEL_TEMP', '--position', '0', '--base', 'A']);
  assert.throws(() => qualification.qualifyPair(fs.readFileSync(source), fs.readFileSync(file)), /drift/);
}

function verifyReceiptRejections() {
  const file = process.env.GENOS_HACHIMOJI_RECEIPT || path.join(catalog.root, catalog.receiptPath);
  const plan = JSON.parse(fs.readFileSync(file));
  const unqualified = { ...plan, status: 'prepared' };
  unqualified.receiptHash = qualification.receiptDigest(unqualified);
  assert.throws(() => workflow.assertQualified(unqualified), /status|qualified|actual/i);
  const forged = { ...plan, status: 'qualified-encoding-equivalence', evidence: [] };
  forged.receiptHash = qualification.receiptDigest(forged);
  assert.throws(() => workflow.assertQualified(forged));
  const stale = { ...forged, sourceFingerprint: '0'.repeat(64) };
  stale.receiptHash = qualification.receiptDigest(stale);
  assert.throws(() => workflow.assertQualified(stale), /Stale/);
  assert.throws(() => catalog.confined(catalog.root, 'agents/../../outside.dna'));
}

async function run() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-h8-migration-'));
  try {
    const source = path.join(__dirname, 'fixtures/agent-dna-v1/local_code_worker.dna');
    const output = path.join(directory, 'migrated.dna');
    cli(['migrate-hachimoji', '--input', source, '--output', output]);
    const before = fs.readFileSync(source);
    const after = fs.readFileSync(output);
    const pair = qualification.qualifyPair(before, after);
    verifyExpression(pair.source, pair.target);
    assert.equal((await trust.evaluateGenomeTrust(null, pair.target)).trusted, true);
    const priorPolicy = process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED;
    process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED = '1';
    try { assert.equal((await trust.evaluateGenomeTrust(null, pair.target)).trusted, false); }
    finally { if (priorPolicy === undefined) delete process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED;
      else process.env.GENOS_AGENT_DNA_REQUIRE_SIGNED = priorPolicy; }
    const genes = unpack(decodeContainer(after).sections.get('GENE'));
    const temp = genes.MODEL_TEMP;
    assert.match(unpackBases(Buffer.from(temp[1]), temp[2]), /[PZBS]/);
    const again = path.join(directory, 'again.dna');
    cli(['migrate-hachimoji', '--input', output, '--output', again]);
    assert.deepEqual(fs.readFileSync(again), after, 'Migration must be idempotent');
    verifySignedRefusal(directory, source);
    verifyCorruption(directory, after);
    verifyInstructionDrift(directory, source, output);
    verifyReceiptRejections();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  console.log('Hachimoji migration: legacy, lossless behavior, idempotence, signed/sealed refusal, strict trust, corruption and missing/stale proof rejection passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
