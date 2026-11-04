'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { resolveGenosBin } = require('../genosCliEnv');
const qualification = require('./hachimojiQualification');

const root = path.resolve(__dirname, '../../../..');
const receiptPath = 'shared/agentDnaHachimojiQualification.json';
const proofPrograms = ['test_hachimoji_catalog.cjs', 'test_hachimoji_migration.cjs',
  'test_hachimoji_runtime.cjs', 'test_worker_genome_execution.cjs',
  'test_genome_policy.js', 'test_genome_innovation.js'];

function proofTimeoutMs(filename) {
  return ['test_hachimoji_catalog.cjs', 'test_worker_genome_execution.cjs'].includes(filename) ? 600000 : 180000;
}

function listFiles(directory, suffix) {
  return fs.readdirSync(path.join(root, directory), { recursive: true })
    .filter(file => file.endsWith(suffix)).map(file => `${directory}/${file.replaceAll('\\', '/')}`).sort();
}

function inventory() {
  const entries = listFiles('agents/dna', '.dna').map(file => ({ source: file, target: file, kind: 'transcode' }));
  const known = new Set(entries.map(entry => entry.target));
  for (const source of listFiles('agents', '.agent.json')) {
    const target = source.replace('agents/', 'agents/dna/').replace(/\.agent\.json$/, '.dna');
    if (!known.has(target)) entries.push({ source, target, kind: 'compile' });
  }
  return entries.sort((a, b) => a.target.localeCompare(b.target, 'en'));
}

function confined(directory, file) {
  assert.match(file, /^(agents\/|backend\/|crates\/|shared\/)/);
  assert.ok(!file.split('/').includes('..'), 'Parent traversal is forbidden');
  const result = path.resolve(directory, file);
  assert.ok(result.startsWith(path.resolve(directory) + path.sep), 'Path must stay inside root');
  assertNoSymlinks(result, path.resolve(directory));
  return result;
}

function assertNoSymlinks(file, boundary) {
  let current = file;
  while (current !== boundary) {
    assert.ok(!fs.existsSync(current) || !fs.lstatSync(current).isSymbolicLink(), 'Symlinks are forbidden');
    current = path.dirname(current);
  }
  if (fs.existsSync(boundary)) assert.equal(fs.realpathSync(boundary), boundary);
}

function sourceBytes(revision, entry) {
  assert.match(revision, /^[0-9a-f]{40}$/);
  confined(root, entry.source);
  return execFileSync('git', ['show', `${revision}:${entry.source}`], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
}

function cli(args) {
  const result = spawnSync(resolveGenosBin(), ['genome', ...args],
    { cwd: root, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const response = JSON.parse(result.stdout);
  assert.equal(response.success, true);
  return response;
}

function inspectEntry(context, entry) {
  const before = sourceBytes(context.baselineRevision, entry);
  assert.equal(qualification.digest(before), entry.sourceSha256, `${entry.source}: source changed`);
  const file = confined(context.directory, entry.target);
  const bytes = fs.readFileSync(file);
  assert.equal(qualification.digest(bytes), entry.targetSha256, `${entry.target}: candidate changed`);
  const result = entry.kind === 'transcode'
    ? qualification.qualifyPair(before, bytes) : qualification.qualifyCompilation(before, bytes);
  assert.equal(result.target.contentHash, entry.targetContentHash);
  assert.equal(result.semanticHash, entry.semanticHash);
  const validated = cli(['validate', '--file', file]);
  assert.equal(validated.status, 'VALID');
  assert.equal(validated.content_hash, result.target.contentHash);
  const inspected = cli(['inspect', '--file', file]);
  assert.equal(inspected.strands.maternal.sequence, result.target.maternal.sequence);
  assert.equal(inspected.content_hash, result.target.contentHash);
  assert.equal(inspected.alphabet, 'ACGTPZBS');
  return result;
}

function verifyCatalog(receipt, directory = root) {
  assert.equal(receipt.authorizesPromotion, false);
  const expected = inventory().map(entry => entry.target).sort();
  assert.deepEqual(receipt.entries.map(entry => entry.target).sort(), expected, 'Inventory must be complete');
  for (const entry of receipt.entries) inspectEntry({ directory, baselineRevision: receipt.baselineRevision }, entry);
  return { qualified: receipt.entries.length, scope: 'encoding-equivalence', authorizesPromotion: false };
}

function sourceFingerprint() {
  const directories = ['crates/genos-dna/src', 'crates/genos-genome/src', 'backend/src/services/agentDna'];
  const files = directories.flatMap(directory => listFiles(directory, directory.startsWith('crates') ? '.rs' : '.js'));
  files.push('crates/genos-cli/src/args/genome.rs', 'crates/genos-cli/src/commands/genome_migration.rs',
    'crates/genos-cli/src/commands/genome.rs', 'backend/src/services/workerGenomeExpression.js',
    'backend/src/services/agentDnaTrust.js', 'backend/src/services/agentDnaPolicy.js',
    'backend/src/services/daemon/residentDaemonGenome.js', 'backend/src/services/daemon/residentDaemonRuntime.js',
    'backend/bin/migrate-agent-dna-hachimoji.cjs',
    'backend/tests/test_hachimoji_catalog.cjs', 'backend/tests/test_hachimoji_migration.cjs',
    'backend/tests/test_hachimoji_runtime.cjs', 'backend/tests/test_worker_genome_execution.cjs',
    'backend/tests/test_genome_policy.js', 'backend/tests/test_genome_innovation.js',
    'backend/tests/fixtures/agent-dna-v1/preuve_evidence.dna',
    'backend/tests/fixtures/agent-dna-v1/local_code_worker.dna');
  return qualification.digest(JSON.stringify(files.sort().map(file => [file, sourceFileDigest(file)])));
}

function sourceFileDigest(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  const source = /\.(rs|js|cjs)$/.test(file) ? bytes.toString('utf8').replace(/\r\n/g, '\n') : bytes;
  return qualification.digest(source);
}

function writeReceipt(file, receipt) {
  const { receiptHash, ...body } = receipt;
  const result = { ...body, receiptHash: qualification.receiptDigest(body) };
  const { entries, ...header } = result;
  const lines = JSON.stringify(header, null, 2).trimEnd().slice(0, -1).trimEnd();
  const output = `${lines},\n  "entries": [\n${entries.map(entry => `    ${JSON.stringify(entry)}`).join(',\n')}\n  ]\n}\n`;
  const temporary = `${file}.${require('node:crypto').randomUUID()}.tmp`;
  fs.writeFileSync(temporary, output, { flag: 'wx' });
  fs.renameSync(temporary, file);
  return result;
}

function assertQualified(receipt) {
  assert.equal(receipt.receiptHash, qualification.receiptDigest(receipt), 'Corrupt receipt');
  assert.equal(receipt.sourceFingerprint, sourceFingerprint(), 'Stale qualification');
  assert.equal(receipt.status, 'qualified-encoding-equivalence');
  assert.equal(receipt.authorizesPromotion, false);
  assert.equal(receipt.cognitiveImprovementDemonstrated, false);
  assert.deepEqual(receipt.evidence.map(record => record.program), proofPrograms.map(name => `backend/tests/${name}`));
  assert.ok(receipt.evidence.every(record => record.exitCode === 0 && /^[0-9a-f]{64}$/.test(record.outputDigest)));
}

function loadQualifiedGenome(file) {
  const receipt = JSON.parse(fs.readFileSync(path.join(root, receiptPath)));
  assertQualified(receipt);
  const entry = receipt.entries.find(item => item.target === file);
  assert.ok(entry, 'Genome is outside qualification scope');
  const bytes = fs.readFileSync(confined(root, file));
  assert.equal(qualification.digest(bytes), entry.targetSha256, 'Qualified genome changed');
  return bytes;
}

module.exports = { root, receiptPath, inventory, confined, sourceBytes, cli, inspectEntry,
  verifyCatalog, sourceFingerprint, writeReceipt, proofPrograms, proofTimeoutMs, assertQualified, loadQualifiedGenome };
