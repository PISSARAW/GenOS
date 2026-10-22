'use strict';

// Chantier D : le worker local (executor: local) reçoit le CONTENU des fichiers
// avec sha256, applique les blocs [ARTIFACT] dans sa capsule, exécute les
// commandes allowlistées via la sandbox et joint les preuves au dossier.
// Aucun appel LLM : la réponse modèle est simulée par des JSON figés.

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const runtime = require('../bin/local-codex-runtime.cjs');
const policy = require('../src/services/sandboxCommandPolicy');
const contract = require('../src/services/agents/workerArtifactContract');

const FIXTURES = path.resolve(__dirname, 'fixtures/local-worker-capsule');
const FIXED_SUM = `'use strict';\n\nfunction sum(first, second) {\n  return first + second;\n}\n\nmodule.exports = { sum };\n`;

function freshCapsule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-local-worker-capsule-'));
  fs.cpSync(FIXTURES, dir, { recursive: true });
  return dir;
}

function dossierReply() {
  return JSON.stringify({ outcome: 'success',
    claims: [{ statement: 'Bug corrigé dans buggy-sum.js, tests réussis.', evidence: ['scope:local-worker-capsule'] }],
    scopeCompletion: { scopeRef: 'scope://local-worker-capsule', completedRefs: ['capsule:buggy-sum.js'] },
    tests: ['npm test'] });
}

function checkFileReading(capsule) {
  fs.mkdirSync(path.join(capsule, 'src'));
  fs.writeFileSync(path.join(capsule, 'src', 'delivery.js'), 'function pendingAfterRestart(queue) { return queue; }');
  const excerpt = runtime.readWorkspaceFileExcerpt(capsule, 'buggy-sum.js');
  const expected = fs.readFileSync(path.join(capsule, 'buggy-sum.js'));
  assert.equal(excerpt.refused, undefined);
  assert.equal(excerpt.sha256, crypto.createHash('sha256').update(expected).digest('hex'));
  assert.match(excerpt.content, /first - second/);
  const built = runtime.buildWorkspaceContext(capsule);
  assert.match(built.text, /\[FICHIER buggy-sum\.js \| sha256=[a-f0-9]{64}\]/);
  assert.match(built.text, /first - second/);
  assert.equal(built.fileHashes['buggy-sum.js'], excerpt.sha256);
  assert.match(built.text, /\[FICHIER src[\\/]delivery\.js \| sha256=[a-f0-9]{64}\]/);
  assert.match(built.text, /pendingAfterRestart/);
}

function checkSizeRefusal(capsule) {
  fs.writeFileSync(path.join(capsule, 'big.txt'), 'x'.repeat(40000));
  const excerpt = runtime.readWorkspaceFileExcerpt(capsule, 'big.txt');
  assert.equal(excerpt.refused, 'too_large');
  assert.match(excerpt.sha256, /^[a-f0-9]{64}$/);
  assert.equal(excerpt.content, undefined);
  const built = runtime.buildWorkspaceContext(capsule);
  assert.match(built.text, /\[FICHIER big\.txt : REFUS too_large, sha256=[a-f0-9]{64}\]/);
  assert.equal(built.text.includes('x'.repeat(1000)), false);
}

function checkPathConfinement(capsule) {
  assert.equal(runtime.readWorkspaceFileExcerpt(capsule, '../escape.js').refused, 'path_escape');
  assert.equal(runtime.readWorkspaceFileExcerpt(capsule, '/abs/escape.js').refused, 'path_escape');
  assert.equal(policy.isAllowedSandboxTestCommand('node test-sum.js'), true);
  assert.equal(policy.isAllowedSandboxTestCommand('npm test'), true);
  assert.equal(policy.isAllowedSandboxTestCommand('node -e process.exit(0)'), false);
  assert.equal(policy.isAllowedSandboxTestCommand('node ../escape-test.js'), false);
  assert.equal(policy.isAllowedSandboxTestCommand('node server.js'), false);
  try {
    fs.symlinkSync(path.join(capsule, 'buggy-sum.js'), path.join(capsule, 'link-sum.js'), 'file');
    assert.equal(runtime.readWorkspaceFileExcerpt(capsule, 'link-sum.js').refused, 'not_a_file');
    fs.rmSync(path.join(capsule, 'link-sum.js'), { force: true });
  } catch (error) {
    if (error.code !== 'EPERM' && error.code !== 'UNKNOWN') throw error;
  }
}

function checkArtifactApplication(capsule) {
  assert.deepEqual(runtime.applyWorkerArtifacts('[ARTIFACT: probe.js]probe[/ARTIFACT]', capsule, false), []);
  assert.equal(fs.existsSync(path.join(capsule, 'probe.js')), false);
  assert.throws(() => runtime.applyWorkerArtifacts('[ARTIFACT: ../escape.js]evil[/ARTIFACT]', capsule, true), /escapes/);
  assert.equal(fs.existsSync(path.join(path.dirname(capsule), 'escape.js')), false);
  const applied = runtime.applyWorkerArtifacts(`[ARTIFACT: buggy-sum.js]${FIXED_SUM}[/ARTIFACT]`, capsule, true);
  assert.deepEqual(applied, ['buggy-sum.js']);
  assert.equal(fs.readFileSync(path.join(capsule, 'buggy-sum.js'), 'utf8'), FIXED_SUM.trim());
  assert.equal(fs.existsSync(path.join(path.dirname(capsule), 'escape.js')), false);
}

async function checkSandboxExecution(capsule) {
  fs.copyFileSync(path.join(FIXTURES, 'buggy-sum.js'), path.join(capsule, 'buggy-sum.js'));
  const failing = await runtime.collectCommandProofs(JSON.stringify({ tests: ['npm test'] }), capsule, { allowedCommands: ['npm test'] });
  assert.equal(failing.length, 1);
  assert.equal(failing[0].executed, true);
  assert.notEqual(failing[0].exitCode, 0);
  assert.match(`${failing[0].stdout}\n${failing[0].stderr}`, /AssertionError/);
  const refused = await runtime.collectCommandProofs(JSON.stringify({ tests: ['node test-sum.js'] }), capsule, { allowedCommands: ['npm test'] });
  assert.equal(refused[0].executed, false);
  assert.equal(refused[0].reason, 'not_in_allowed_commands');
  const unsupported = await runtime.collectCommandProofs(JSON.stringify({ tests: ['node test-sum.js'] }), capsule, { allowedCommands: ['node test-sum.js'] });
  assert.equal(unsupported[0].executed, false);
  assert.equal(unsupported[0].reason, 'executor_refused');
  const dangerous = await runtime.collectCommandProofs(JSON.stringify({ tests: ['rm -rf /'] }), capsule, { allowedCommands: ['rm -rf /'] });
  assert.equal(dangerous[0].executed, false);
  assert.equal(dangerous[0].reason, 'not_allowlisted');
  runtime.applyWorkerArtifacts(`[ARTIFACT: buggy-sum.js]${FIXED_SUM}[/ARTIFACT]`, capsule, true);
  const passing = await runtime.collectCommandProofs(JSON.stringify({ tests: ['npm test'] }), capsule, { allowedCommands: ['npm test'] });
  assert.equal(passing[0].executed, true);
  assert.equal(passing[0].exitCode, 0);
  assert.match(passing[0].stdout, /sum checks passed/);
  assert.match(passing[0].digest, /^[a-f0-9]{64}$/);
  return passing;
}

function checkContractInvalidation() {
  const inspected = contract.inspectWorkerArtifact('bounded_worker', dossierReply(), { source: 'frozen-model' });
  assert.equal(inspected.artifact, null);
  assert.ok(inspected.issues.includes('dossier.code_fix.unsubstantiated'));
  const worker = { agentId: 'code-worker', workerContract: { identity: { workerKind: 'bounded_worker' }, evidence: { requiredArtifacts: ['dossier'] } } };
  assert.throws(() => contract.validateWorkerArtifact({ events: [{ evidenceReport: JSON.parse(dossierReply()) }] }, worker),
    (error) => error.code === 'INVALID_WORKER_ARTIFACT');
}

function checkContractWithProofs(proofs) {
  const augmented = runtime.augmentReplyWithProofs(dossierReply(), proofs);
  const inspected = contract.inspectWorkerArtifact('bounded_worker', augmented, { source: 'local-codex-runtime' });
  assert.equal(inspected.issues.length, 0);
  assert.equal(inspected.artifact.type, 'dossier');
  const parsed = JSON.parse(augmented);
  assert.equal(parsed.tests.length, 1);
  assert.equal(parsed.tests[0].exitCode, 0);
  assert.ok(parsed.claims[0].evidence.some((ref) => String(ref).startsWith('genos://code-test/')));
}

async function main() {
  const capsule = freshCapsule();
  try {
    checkFileReading(capsule);
    checkSizeRefusal(capsule);
    checkPathConfinement(capsule);
    checkArtifactApplication(capsule);
    const proofs = await checkSandboxExecution(capsule);
    checkContractInvalidation();
    checkContractWithProofs(proofs);
  } finally {
    fs.rmSync(capsule, { recursive: true, force: true });
  }
  process.stdout.write('Local worker file capabilities checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
