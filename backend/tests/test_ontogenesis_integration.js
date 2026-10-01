'use strict';

const assert = require('assert');
const service = require('../src/services/ontogenesis/integrationService');

// Message conventionnel avec tatouage d'opération.
const message = service.buildCommitMessage({ tag: 'FEAT', title: 'ajouter la boucle', operationId: 'op-1', taskId: 't-1' });
assert.ok(message.startsWith('[FEAT] ajouter la boucle'));
assert.ok(message.includes('Genos-Operation: op-1'));
assert.ok(message.includes('Genos-Task: t-1'));

// Candidat valide puis refus sans preuves.
const authority = { branches: ['codex/ontogenesis'], paths: ['backend/src/'] };
const good = service.validateCandidate({ authority, candidate: { branch: 'codex/ontogenesis', baseSha: 'abc', files: ['backend/src/a.js'], proofs: [{ command: 'npm test', status: 0 }] } });
assert.strictEqual(good.ok, true);
const noProof = service.validateCandidate({ authority, candidate: { branch: 'codex/ontogenesis', baseSha: 'abc', files: ['backend/src/a.js'], proofs: [] } });
assert.ok(noProof.errors.includes('preuves-requises'));
const secret = service.validateCandidate({ authority, candidate: { branch: 'codex/ontogenesis', baseSha: 'abc', files: ['.env'], proofs: [{ command: 'x', status: 0 }] } });
assert.ok(secret.errors.some((error) => error.startsWith('fichier-interdit')));
assert.ok(secret.errors.some((error) => error.startsWith('chemin-hors-perimetre')));
const database = service.validateCandidate({ authority: { branches: ['*'], paths: ['*'] }, candidate: { branch: 'main', baseSha: 'abc', files: ['data/genos.db'], proofs: [{ command: 'x', status: 0 }] } });
assert.ok(database.errors.some((error) => error.startsWith('fichier-interdit')));
const branch = service.validateCandidate({ authority, candidate: { branch: 'main', baseSha: 'abc', files: ['backend/src/a.js'], proofs: [{ command: 'x', status: 0 }] } });
assert.ok(branch.errors.includes('branche-hors-perimetre'));

function fakeGit(responses) {
  return { calls: [], run: async (args) => { responses.calls.push(args); return responses.handler(args); } };
}

async function memoryDb() {
  const sqlite3 = require('sqlite3');
  const { open } = require('sqlite');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const { migrateOntogenesis } = require('../src/db/migrations/migrateOntogenesis');
  await migrateOntogenesis(db);
  return db;
}

(async () => {
  const db = await memoryDb();
  // Candidats concurrents : deux lignes, pas de double écriture.
  const first = await service.openIntegration(db, { id: 'i-1', projectId: 'p1', taskId: 't1', baseSha: 'abc' });
  const again = await service.openIntegration(db, { id: 'i-1', projectId: 'p1', taskId: 't1', baseSha: 'abc' });
  assert.strictEqual(first, again);
  const second = await service.openIntegration(db, { id: 'i-2', projectId: 'p1', taskId: 't1', baseSha: 'abc' });
  assert.notStrictEqual(first, second);

  // SHA enregistré et commit existant : rien à refaire.
  await service.setIntegrationResult(db, { id: 'i-1', status: 'committed', resultSha: 'sha1', checks: ['tests'] });
  const git = fakeGit({ calls: [], handler: async (args) => {
    if (args[0] === 'cat-file') return { stdout: '' };
    if (args[0] === 'log') return { stdout: '' };
    return { stdout: '' };
  } });
  const done = await service.reconcileIntegration(db, git, { integrationId: 'i-1', worktree: '/tmp/w', operationId: 'op-1' });
  assert.deepStrictEqual(done, { status: 'committed', sha: 'sha1' });

  // Crash entre commit et SQLite : le commit est retrouvé par tatouage.
  const git2 = fakeGit({ calls: [], handler: async (args) => {
    if (args[0] === 'cat-file') throw new Error('missing');
    if (args[0] === 'log') return { stdout: 'sha9\n' };
    return { stdout: '' };
  } });
  const recovered = await service.reconcileIntegration(db, git2, { integrationId: 'i-2', worktree: '/tmp/w', operationId: 'op-2' });
  assert.deepStrictEqual(recovered, { status: 'committed', recovered: true, sha: 'sha9' });
  const row = await service.getIntegration(db, 'i-2');
  assert.strictEqual(row.result_sha, 'sha9');

  // Worktree sale : modifications humaines détectées avant écriture.
  const git3 = fakeGit({ calls: [], handler: async (args) => {
    if (args[0] === 'rev-parse') return { stdout: 'abc\n' };
    if (args[0] === 'status') return { stdout: ' M main.js\n' };
    return { stdout: '' };
  } });
  const inspection = await service.inspectWorktree(git3, '/tmp/w');
  assert.deepStrictEqual(inspection, { headSha: 'abc', dirty: true });

  // HEAD déplacé : conflit, pas d'écrasement silencieux.
  const git4 = fakeGit({ calls: [], handler: async (args) => {
    if (args[0] === 'rev-parse') return { stdout: 'def\n' };
    if (args[0] === 'status') return { stdout: '' };
    return { stdout: '' };
  } });
  const moved = await service.inspectWorktree(git4, '/tmp/w');
  assert.strictEqual(moved.headSha === 'abc', false);

  console.log('ontogenesis integration checks passed.');
})().catch((error) => { console.error(error); process.exit(1); });
