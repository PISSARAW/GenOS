'use strict';

/**
 * Migration legacy daemon_repo_state.json → SQLite (ADR 0034 D1).
 *
 * L'ancien état est un dict { absoluteRepoPath: record } avec :
 *   { branch, base, worktree, status, lastSync, lastFix,
 *     commitsAheadOfBase, mergeRequest, updatedAt, history[] }
 * Statuts observés : watching | fix_committed | sync_conflict | skipped | error.
 *
 * La migration est one-shot, idempotente (ON CONFLICT DO NOTHING),
 * et ne devine jamais le HEAD : le caller fournit defaultHeadSha
 * (ex: git rev-parse HEAD du workspace). Sans HEAD valide, l'entrée
 * est sautée et comptée dans skipped (pas de connaissance fantôme).
 *
 * Aucun LLM, aucune écriture repo, aucune inférence de vérité.
 */

const territoryService = require('./daemonTerritoryService');

const LEGACY_STATUS_MAP = {
  watching: 'ACTIVE',
  fix_committed: 'ACTIVE',
  sync_conflict: 'DEGRADED',
  skipped: 'DORMANT',
  error: 'DEGRADED'
};

const SHA_PATTERN = /^[a-f0-9]{40}$/;

function sanitizeRepoName(repoPath) {
  const base = String(repoPath || '').split(/[\\/]/).filter(Boolean).pop() || 'unknown';
  return base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'unknown';
}

function mapLegacyStatus(status) {
  return LEGACY_STATUS_MAP[status] || 'DORMANT';
}

function buildTerritoryInput(repoPath, record, defaults) {
  const repoName = sanitizeRepoName(repoPath);
  return {
    id: `territory.legacy-${repoName}`,
    organizationId: defaults.organizationId,
    projectId: defaults.projectId,
    workspaceId: defaults.workspaceId,
    repoIdentity: repoName,
    rootPath: String(repoPath),
    scopePath: '/',
    ref: record.base || defaults.ref || 'main',
    headSha: defaults.defaultHeadSha,
    state: mapLegacyStatus(record.status),
    metadata: {
      migratedFrom: 'daemon_repo_state.json',
      legacyBranch: record.branch || null,
      legacyWorktree: record.worktree || null,
      legacyCommitsAhead: record.commitsAheadOfBase || 0,
      legacyUpdatedAt: record.updatedAt || null
    }
  };
}

function validateDefaults(defaults) {
  if (!defaults || typeof defaults !== 'object') return false;
  if (!defaults.organizationId || !defaults.projectId || !defaults.workspaceId) return false;
  return SHA_PATTERN.test(defaults.defaultHeadSha || '');
}

/**
 * Migre un état legacy chargé (objet) vers daemon_territories.
 * @param {object} db handle GenOS (run/get/all/exec)
 * @param {object} legacyState dict { repoPath: record }
 * @param {object} defaults { organizationId, projectId, workspaceId, defaultHeadSha, ref? }
 */
async function migrateLegacyState(db, legacyState, defaults) {
  const result = { migrated: 0, skipped: 0, ids: [] };
  if (!db || !legacyState || typeof legacyState !== 'object') return result;
  if (!validateDefaults(defaults)) return { migrated: 0, skipped: Object.keys(legacyState).length, ids: [] };
  const entries = Object.entries(legacyState);
  for (const [repoPath, record] of entries) {
    const done = await migrateOneEntry(db, { repoPath, record, defaults });
    if (done.migrated) {
      result.migrated += 1;
      result.ids.push(done.id);
    } else {
      result.skipped += 1;
    }
  }
  return result;
}

async function migrateOneEntry(db, args) {
  const { repoPath, record, defaults } = args;
  if (!repoPath || !record || typeof record !== 'object') return { migrated: false };
  const input = buildTerritoryInput(repoPath, record, defaults);
  const created = await territoryService.createTerritory(db, input);
  if (!created.found) return { migrated: false };
  return { migrated: true, id: created.territory.id };
}

module.exports = {
  migrateLegacyState,
  sanitizeRepoName,
  mapLegacyStatus,
  buildTerritoryInput,
  LEGACY_STATUS_MAP
};
