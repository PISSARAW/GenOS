'use strict';

/**
 * RepairEpisode — capsule de réparation isolée (ADR 0034 D14 v1).
 *
 * Séparation stricte : le daemon résident ouvre l'épisode sur un
 * finding REPAIRABLE (lease temporaire + scope + budget +
 * expiration + branche genos-repair/<finding>) ; un worker le
 * réclame, l'exécute dans une capsule isolée
 * (createIsolatedWorkspace, jamais le worktree persistant du
 * daemon), puis le clôt. Le service ne touche jamais au
 * filesystem : il persiste l'intention et la lease, le worker
 * provisionne la capsule. Aucune écriture repo sans lease.
 *
 * Statuts : OPEN → CLAIMED → SUCCEEDED | FAILED ; OPEN/CLAIMED
 * expirés → EXPIRED (via expireEpisodes, appelé par le
 * Reconciler). Un finding réfuté/expiré ne rouvre jamais.
 */

const { migrateDaemonRepair } = require('../../../db/migrations/migrateDaemonRepair');
const findingService = require('../findings/findingService');
const territoryService = require('../daemonTerritoryService');

const EPISODE_STATUSES = ['OPEN', 'CLAIMED', 'SUCCEEDED', 'FAILED', 'EXPIRED'];
const TERMINAL_EPISODE = ['SUCCEEDED', 'FAILED', 'EXPIRED'];
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_BUDGET = { toolCalls: 50, tokens: 20000 };
const ALLOWED_COMMANDS = ['read', 'test-safe', 'snapshot', 'patch-scoped'];
const FORBIDDEN_COMMANDS = ['git_push', 'merge', 'commit-direct'];

const ID_PATTERN = /^repair\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FINDING_PATTERN = /^finding\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CREATOR_PATTERN = /^daemon\.[a-z0-9]+(?:-[a-z0-9]+)*$/;

function branchNameFor(findingId) {
  const slug = String(findingId || '').replace(/^finding\./, '');
  return `genos-repair/${slug}`;
}

function episodeIdFor(findingId) {
  const slug = String(findingId || '').replace(/^finding\./, '');
  return `repair.${slug}`;
}

function rowToEpisode(row) {
  if (!row) return null;
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'DaemonRepairEpisode',
    id: row.id,
    territoryId: row.territory_id,
    findingId: row.finding_id,
    headSha: row.head_sha,
    scope: { type: row.scope_type, value: row.scope_value },
    status: row.status,
    lease: safeParseObject(row.lease_json),
    branchName: row.branch_name,
    workerId: row.worker_id || null,
    workspacePath: row.workspace_path || null,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at
  };
}

function safeParseObject(text) {
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function collectOpenErrors(input, errors) {
  if (!FINDING_PATTERN.test(input.findingId || '')) errors.push('invalid-findingId');
  if (!CREATOR_PATTERN.test(input.createdBy || '')) errors.push('invalid-createdBy');
  if (input.budget && typeof input.budget !== 'object') errors.push('invalid-budget');
}

function validateOpenInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input-object-required'] };
  const errors = [];
  collectOpenErrors(input, errors);
  return { ok: errors.length === 0, errors };
}

function buildLease(episode, input) {
  const now = Date.now();
  const ttl = input.ttlMs || DEFAULT_TTL_MS;
  return {
    findingId: episode.findingId,
    scope: episode.scope,
    allowedCommands: ALLOWED_COMMANDS,
    forbidden: FORBIDDEN_COMMANDS,
    budget: input.budget || DEFAULT_BUDGET,
    branchName: episode.branchName,
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttl).toISOString()
  };
}

function toEpisodeId(input) {
  if (input.id && ID_PATTERN.test(input.id)) return input.id;
  return episodeIdFor(input.findingId);
}

async function openEpisode(db, args) {
  const validation = validateOpenInput(args);
  if (!validation.ok) return { opened: false, errors: validation.errors };
  await migrateDaemonRepair(db);
  const existing = await db.get('SELECT * FROM daemon_repair_episodes WHERE finding_id = ?', args.findingId);
  if (existing) return { opened: true, episode: rowToEpisode(existing), deduped: true };
  const finding = await findingService.getFinding(db, { id: args.findingId });
  if (!finding.found) return { opened: false, errors: ['unknown-finding'] };
  const gate = gateRepairable(finding.finding);
  if (!gate.ok) return { opened: false, errors: gate.errors };
  const territory = await territoryService.getTerritory(db, { id: finding.finding.territoryId });
  if (!territory.found) return { opened: false, errors: ['unknown-territory'] };
  return insertEpisode(db, { finding: finding.finding, args });
}

function gateRepairable(finding) {
  if (finding.status !== 'REPAIRABLE') return { ok: false, errors: [`finding-not-repairable:${finding.status}`] };
  return { ok: true };
}

async function insertEpisode(db, job) {
  const { finding, args } = job;
  const id = toEpisodeId(args);
  const branch = branchNameFor(finding.id);
  const draft = {
    findingId: finding.id,
    scope: finding.scope,
    branchName: branch
  };
  const lease = buildLease(draft, args);
  await db.run(
    `INSERT INTO daemon_repair_episodes
      (id, territory_id, finding_id, head_sha, scope_type, scope_value,
       status, lease_json, branch_name, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
    id,
    finding.territoryId,
    finding.id,
    finding.headSha,
    finding.scope.type,
    finding.scope.value,
    JSON.stringify(lease),
    branch,
    args.createdBy,
    lease.expiresAt
  );
  const stored = await getEpisode(db, { id });
  return { opened: true, episode: stored.episode, deduped: false };
}

async function getEpisode(db, query) {
  if (!db || !query || !query.id) return { found: false };
  await migrateDaemonRepair(db);
  const row = await db.get('SELECT * FROM daemon_repair_episodes WHERE id = ?', query.id);
  if (!row) return { found: false };
  return { found: true, episode: rowToEpisode(row) };
}

async function listEpisodes(db, filter) {
  if (!db) return [];
  await migrateDaemonRepair(db);
  const scoped = filter || {};
  if (scoped.status && EPISODE_STATUSES.includes(scoped.status)) {
    return rowsToEpisodes(await db.all(
      'SELECT * FROM daemon_repair_episodes WHERE territory_id = ? AND status = ? ORDER BY updated_at DESC',
      scoped.territoryId,
      scoped.status
    ));
  }
  return rowsToEpisodes(await db.all(
    'SELECT * FROM daemon_repair_episodes WHERE territory_id = ? ORDER BY updated_at DESC',
    scoped.territoryId
  ));
}

function rowsToEpisodes(rows) {
  return (rows || []).map(rowToEpisode);
}

async function claimEpisode(db, change) {
  if (!db || !change || !change.id) return { claimed: false, errors: ['change-required'] };
  await migrateDaemonRepair(db);
  const row = await db.get('SELECT status FROM daemon_repair_episodes WHERE id = ?', change.id);
  if (!row) return { claimed: false, errors: ['not-found'] };
  if (row.status !== 'OPEN') return { claimed: false, errors: [`forbidden-claim:${row.status}`] };
  if (!change.workerId) return { claimed: false, errors: ['workerId-required'] };
  await db.run(
    `UPDATE daemon_repair_episodes
     SET status = 'CLAIMED', worker_id = ?, workspace_path = ?, updated_at = datetime('now')
     WHERE id = ?`,
    change.workerId,
    change.workspacePath || null,
    change.id
  );
  const stored = await getEpisode(db, { id: change.id });
  return { claimed: true, episode: stored.episode };
}

async function closeEpisode(db, change) {
  if (!db || !change || !change.id) return { closed: false, errors: ['change-required'] };
  await migrateDaemonRepair(db);
  const row = await db.get('SELECT status FROM daemon_repair_episodes WHERE id = ?', change.id);
  if (!row) return { closed: false, errors: ['not-found'] };
  if (row.status !== 'CLAIMED') return { closed: false, errors: [`forbidden-close:${row.status}`] };
  if (change.toStatus !== 'SUCCEEDED' && change.toStatus !== 'FAILED') {
    return { closed: false, errors: ['invalid-close-status'] };
  }
  await db.run(
    `UPDATE daemon_repair_episodes SET status = ?, updated_at = datetime('now') WHERE id = ?`,
    change.toStatus,
    change.id
  );
  const stored = await getEpisode(db, { id: change.id });
  return { closed: true, episode: stored.episode };
}

async function expireEpisodes(db, scope) {
  if (!db || !scope || !scope.territoryId) return { expired: 0 };
  await migrateDaemonRepair(db);
  const nowIso = scope.nowIso || new Date(scope.now || Date.now()).toISOString();
  const res = await db.run(
    `UPDATE daemon_repair_episodes SET status = 'EXPIRED', updated_at = datetime('now')
     WHERE territory_id = ? AND datetime(expires_at) <= datetime(?)
       AND status IN ('OPEN', 'CLAIMED')`,
    scope.territoryId,
    nowIso
  );
  return { expired: (res && res.changes) || 0 };
}

function isTerminalEpisode(status) {
  return TERMINAL_EPISODE.includes(status);
}

module.exports = {
  branchNameFor,
  openEpisode,
  getEpisode,
  listEpisodes,
  claimEpisode,
  closeEpisode,
  expireEpisodes,
  isTerminalEpisode,
  EPISODE_STATUSES,
  ALLOWED_COMMANDS,
  FORBIDDEN_COMMANDS
};
