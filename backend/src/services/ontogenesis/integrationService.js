'use strict';

const crypto = require('crypto');
const { runCommand } = require('../agentWorkspaceLifecycle/git');
const { pathAllowed, assertContainedFiles } = require('./pathAuthority');
const { validateProofs } = require('./proofService');

/**
 * Intégrateur unique vers la branche d'Ontogenèse (ADR 0235 §6).
 * Un seul écrivain : candidat + preuves → compatibilité HEAD →
 * validation → commit conventionnel → SHA enregistré.
 * L'opération est tatouée dans le message (Genos-Operation) pour
 * réconcilier un crash entre commit et SQLite sans double intégration.
 * Les fichiers humains non stagés ne sont jamais touchés : seuls les
 * chemins validés sont stagés explicitement.
 */

const FORBIDDEN = [/(^|\/)\.env(?:\.|$)/i, /\.pem$/i, /\.key$/i, /secret/i, /\.db$/i, /\.sqlite/i, /(^|\/)node_modules\//, /(^|\/)target\//, /(^|\/)dist\//, /(^|\/)\.git(?:\/|$)/, /(^|\/)\.genos(?:[-/]|$)/];

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function createShellGit() {
  return { run: (args, worktree) => runCommand('git', args, { cwd: worktree }) };
}

function buildCommitMessage(input) {
  const lines = [`[${input.tag}] ${input.title}`, '', `Genos-Operation: ${input.operationId}`];
  if (input.taskId) lines.push(`Genos-Task: ${input.taskId}`);
  return lines.join('\n');
}

function fileAllowed(authority, file) {
  return pathAllowed(authority, file);
}

function checkCandidateFiles(candidate, authority, errors) {
  for (const file of candidate.files || []) {
    if (!fileAllowed(authority, file)) errors.push(`chemin-hors-perimetre:${file}`);
    if (FORBIDDEN.some((pattern) => pattern.test(String(file).replace(/\\/g, '/')))) errors.push(`fichier-interdit:${file}`);
  }
}

function checkCandidateShape(candidate, errors) {
  if (!candidate.baseSha) errors.push('base-sha-requise');
  if (!Array.isArray(candidate.proofs) || candidate.proofs.length === 0) errors.push('preuves-requises');
  if (!Array.isArray(candidate.files) || candidate.files.length === 0) errors.push('fichiers-requis');
}

function checkCandidateBranch(candidate, authority, errors) {
  const branches = authority.branches || [];
  if (!branches.includes(candidate.branch) && !branches.includes('*')) errors.push('branche-hors-perimetre');
}

function validateCandidate(input) {
  const errors = [];
  const candidate = input.candidate || {};
  const authority = input.authority || {};
  checkCandidateBranch(candidate, authority, errors);
  checkCandidateShape(candidate, errors);
  checkCandidateFiles(candidate, authority, errors);
  errors.push(...validateProofs(candidate));
  return { ok: errors.length === 0, errors };
}

async function openIntegration(db, input) {
  const id = input.id || newId('integ');
  await db.run(
    `INSERT OR IGNORE INTO ontogenesis_integrations (id, project_id, task_id, base_sha, status, checks_json)
     VALUES (?, ?, ?, ?, 'pending', '[]')`,
    [id, input.projectId, input.taskId || null, input.baseSha]
  );
  return id;
}

async function getIntegration(db, integrationId) {
  return db.get('SELECT * FROM ontogenesis_integrations WHERE id = ?', [integrationId]);
}

async function setIntegrationResult(db, update) {
  await db.run(
    `UPDATE ontogenesis_integrations SET status = ?, result_sha = ?, checks_json = ? WHERE id = ?`,
    [update.status, update.resultSha || null, JSON.stringify(update.checks || []), update.id]
  );
}

async function currentSha(git, worktree) {
  const result = await git.run(['rev-parse', 'HEAD'], worktree);
  return String(result.stdout || '').trim();
}

async function commitExists(git, worktree, sha) {
  try {
    await git.run(['cat-file', '-e', `${sha}^{commit}`], worktree);
    await git.run(['merge-base', '--is-ancestor', sha, 'HEAD'], worktree);
    return true;
  } catch (_) {
    return false;
  }
}

async function findCommitByOperation(git, worktree, operationId) {
  try {
    const result = await git.run(['log', '--fixed-strings', `--grep=Genos-Operation: ${operationId}`, '--format=%H', '-n', '1', 'HEAD'], worktree);
    const sha = String(result.stdout || '').trim().split('\n')[0] || '';
    return sha || null;
  } catch (_) {
    return null;
  }
}

async function inspectWorktree(git, worktree) {
  const headSha = await currentSha(git, worktree);
  const status = await git.run(['status', '--porcelain'], worktree);
  return { headSha, dirty: String(status.stdout || '').trim().length > 0 };
}

async function adoptRecoveredSha(db, row, sha) {
  await setIntegrationResult(db, { id: row.id, status: 'committed', resultSha: sha, checks: ['recupere-apres-crash'] });
  return { status: 'committed', recovered: true, sha };
}

async function reconcileIntegration(db, git, input) {
  const row = await getIntegration(db, input.integrationId);
  if (!row) return { status: 'introuvable' };
  if (row.result_sha && await commitExists(git, input.worktree, row.result_sha)) {
    return { status: 'committed', sha: row.result_sha };
  }
  const found = await findCommitByOperation(git, input.worktree, input.operationId);
  if (found) return adoptRecoveredSha(db, row, found);
  return { status: row.status, sha: row.result_sha || null };
}

async function stageFiles(git, worktree, files) {
  assertContainedFiles(worktree, files);
  await git.run(['--literal-pathspecs', 'add', '--', ...files], worktree);
}

async function commitStaged(git, worktree, input) {
  if (!input || !Array.isArray(input.files) || !input.files.length) throw new Error('fichiers-commit-requis');
  assertContainedFiles(worktree, input.files);
  const result = await git.run(['--literal-pathspecs', 'commit', '--only', '-m', input.message, '--', ...input.files], worktree);
  return String(result.stdout || '');
}

module.exports = {
  FORBIDDEN, createShellGit, buildCommitMessage, validateCandidate,
  openIntegration, getIntegration, setIntegrationResult,
  currentSha, commitExists, findCommitByOperation, inspectWorktree,
  reconcileIntegration, stageFiles, commitStaged
};
