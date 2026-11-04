'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const catalog = require('../src/services/agentDna/hachimojiCatalog');
const qualification = require('../src/services/agentDna/hachimojiQualification');

const programs = catalog.proofPrograms;

function prepare(directory) {
  assert.ok(!fs.existsSync(path.join(directory, 'plan.json')), 'Migration already prepared');
  const baselineRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: catalog.root, encoding: 'utf8' }).trim();
  const entries = catalog.inventory().map(entry => prepareEntry({ directory, baselineRevision }, entry));
  const plan = { schemaVersion: 1, baselineRevision, scope: 'encoding-equivalence',
    authorizesPromotion: false, cognitiveImprovementDemonstrated: false,
    sourceFingerprint: catalog.sourceFingerprint(), entries };
  catalog.writeReceipt(path.join(directory, 'plan.json'), plan);
  return { prepared: entries.length, baselineRevision };
}

function prepareEntry(context, entry) {
  const before = catalog.sourceBytes(context.baselineRevision, entry);
  const original = fs.readFileSync(catalog.confined(catalog.root, entry.source));
  assert.ok(before.equals(original), `${entry.source}: source must match committed baseline`);
  const archived = catalog.confined(path.join(context.directory, 'original'), entry.source);
  fs.mkdirSync(path.dirname(archived), { recursive: true });
  fs.writeFileSync(archived, original, { flag: 'wx' });
  const target = catalog.confined(path.join(context.directory, 'candidates'), entry.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const operation = entry.kind === 'transcode' ? 'migrate-hachimoji' : 'compile';
  const input = entry.kind === 'transcode' ? archived : entry.source;
  catalog.cli([operation, '--input', input, '--output', target]);
  const bytes = fs.readFileSync(target);
  const result = entry.kind === 'transcode'
    ? qualification.qualifyPair(original, bytes) : qualification.qualifyCompilation(original, bytes);
  return { ...entry, sourceSha256: qualification.digest(original), targetSha256: qualification.digest(bytes),
    sourceContentHash: result.source?.contentHash || null, targetContentHash: result.target.contentHash,
    semanticHash: result.semanticHash, name: result.target.meta.name, role: result.target.phenotype.role };
}

function loadPlan(directory) {
  const plan = JSON.parse(fs.readFileSync(path.join(directory, 'plan.json')));
  assert.equal(plan.receiptHash, qualification.receiptDigest(plan), 'Corrupt plan');
  assert.equal(plan.sourceFingerprint, catalog.sourceFingerprint(), 'Qualification source drift');
  return plan;
}

function runEvidence(directory, filename) {
  const result = spawnSync(process.execPath, [path.join(catalog.root, 'backend/tests', filename)], {
    cwd: catalog.root, encoding: 'utf8', timeout: 180000, windowsHide: true,
    env: { ...process.env, GENOS_HACHIMOJI_CATALOG_DIR: path.join(directory, 'candidates'),
      GENOS_HACHIMOJI_RECEIPT: path.join(directory, 'plan.json') }
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  fs.writeFileSync(path.join(directory, `${filename}.log`), output);
  assert.equal(result.status, 0, `${filename}: ${output.slice(-3000)} ${result.error?.message || ''}`);
  return { program: `backend/tests/${filename}`, exitCode: result.status, outputDigest: qualification.digest(output) };
}

function qualify(directory) {
  const plan = loadPlan(directory);
  const evidence = programs.map(filename => runEvidence(directory, filename));
  assert.equal(plan.sourceFingerprint, catalog.sourceFingerprint(), 'Source drift during qualification');
  catalog.verifyCatalog(plan, path.join(directory, 'candidates'));
  const receipt = catalog.writeReceipt(path.join(directory, 'qualified.json'), { ...plan,
    status: 'qualified-encoding-equivalence', qualifiedAt: new Date().toISOString(), evidence });
  return { qualified: receipt.entries.length, evidence: evidence.length, receiptHash: receipt.receiptHash };
}

function assertQualified(receipt) {
  catalog.assertQualified(receipt);
}

function preflightEntry(directory, entry) {
  const source = fs.readFileSync(catalog.confined(catalog.root, entry.source));
  assert.equal(qualification.digest(source), entry.sourceSha256, `${entry.source}: concurrent source change`);
  if (entry.kind === 'compile') {
    assert.ok(!fs.existsSync(catalog.confined(catalog.root, entry.target)), 'New target already exists');
  }
  const candidate = fs.readFileSync(catalog.confined(path.join(directory, 'candidates'), entry.target));
  assert.equal(qualification.digest(candidate), entry.targetSha256);
}

function assertEvidenceLogs(directory, receipt) {
  for (const record of receipt.evidence) {
    const output = fs.readFileSync(path.join(directory, `${path.basename(record.program)}.log`));
    assert.equal(qualification.digest(output), record.outputDigest, 'Missing or modified executable evidence');
  }
}

function installEntry(directory, entry) {
  preflightEntry(directory, entry);
  const target = catalog.confined(catalog.root, entry.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${require('node:crypto').randomUUID()}.tmp`;
  fs.copyFileSync(catalog.confined(path.join(directory, 'candidates'), entry.target), temporary, fs.constants.COPYFILE_EXCL);
  assert.equal(qualification.digest(fs.readFileSync(temporary)), entry.targetSha256);
  fs.renameSync(temporary, target);
}

function apply(directory) {
  const receipt = JSON.parse(fs.readFileSync(path.join(directory, 'qualified.json')));
  assertQualified(receipt);
  assertEvidenceLogs(directory, receipt);
  catalog.verifyCatalog(receipt, path.join(directory, 'candidates'));
  receipt.entries.forEach(entry => preflightEntry(directory, entry));
  const applied = [];
  try {
    for (const entry of receipt.entries) {
      installEntry(directory, entry);
      applied.push(entry);
    }
    catalog.verifyCatalog(receipt);
    catalog.writeReceipt(path.join(catalog.root, catalog.receiptPath), receipt);
  } catch (error) {
    for (const entry of applied.reverse()) rollbackEntry(directory, entry);
    throw error;
  }
  return { migrated: applied.length, receipt: catalog.receiptPath, authorizesPromotion: false };
}

function rollbackEntry(directory, entry) {
  const target = catalog.confined(catalog.root, entry.target);
  assert.equal(qualification.digest(fs.readFileSync(target)), entry.targetSha256, 'Concurrent target change; manual recovery required');
  if (entry.kind === 'transcode') {
    fs.copyFileSync(catalog.confined(path.join(directory, 'original'), entry.source), target);
  } else fs.unlinkSync(target);
}

function renew(directory) {
  assert.ok(!fs.existsSync(path.join(directory, 'plan.json')), 'Use a fresh renewal directory');
  const previous = JSON.parse(fs.readFileSync(path.join(catalog.root, catalog.receiptPath)));
  assert.equal(previous.receiptHash, qualification.receiptDigest(previous), 'Corrupt previous receipt');
  assert.equal(previous.status, 'qualified-encoding-equivalence');
  for (const entry of previous.entries) copyInstalledCandidate(directory, entry);
  const { evidence, status, qualifiedAt, receiptHash, ...body } = previous;
  const plan = { ...body, previousReceiptHash: receiptHash, sourceFingerprint: catalog.sourceFingerprint() };
  catalog.writeReceipt(path.join(directory, 'previous-receipt.json'), previous);
  catalog.writeReceipt(path.join(directory, 'plan.json'), plan);
  const result = qualify(directory);
  const renewed = JSON.parse(fs.readFileSync(path.join(directory, 'qualified.json')));
  assertQualified(renewed);
  assertEvidenceLogs(directory, renewed);
  renewed.entries.forEach(entry => assertInstalled(entry));
  catalog.writeReceipt(path.join(catalog.root, catalog.receiptPath), renewed);
  return { ...result, renewed: true };
}

function assertInstalled(entry) {
  const bytes = fs.readFileSync(catalog.confined(catalog.root, entry.target));
  assert.equal(qualification.digest(bytes), entry.targetSha256, 'Installed genome changed');
  return bytes;
}

function copyInstalledCandidate(directory, entry) {
  const bytes = assertInstalled(entry);
  const target = catalog.confined(path.join(directory, 'candidates'), entry.target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes, { flag: 'wx' });
}

function main() {
  const [mode, argument] = process.argv.slice(2);
  assert.ok(['prepare', 'qualify', 'apply', 'renew'].includes(mode) && argument,
    'Usage: node backend/bin/migrate-agent-dna-hachimoji.cjs prepare|qualify|apply|renew WORKDIR');
  const directory = path.resolve(argument);
  const allowed = path.join(catalog.root, '.genos-agent-worlds') + path.sep;
  assert.ok(directory.startsWith(allowed), 'WORKDIR must be inside .genos-agent-worlds');
  fs.mkdirSync(directory, { recursive: true });
  const result = { prepare, qualify, apply, renew }[mode](directory);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
}

module.exports = { assertQualified, programs };
