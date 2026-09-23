'use strict';

/**
 * Daemon Territory Service — ADR 0034 Phase 1.
 *
 * Un territoire est l'unité de connaissance d'un daemon résident :
 * repo + ref + scope_path + head_sha. Toute connaissance est
 * commit-aware : un finding établi sur HEAD=ABC ne vaut plus
 * sans revalidation si le territoire est passé à HEAD=XYZ.
 *
 * Invariants appliqués ici :
 *  - territoire != vérité globale (scoping strict) ;
 *  - persistance != autorité (STALE/EXPIRED sur changement HEAD) ;
 *  - validation déterministe, sans LLM.
 *
 * Persistance : tables daemon_territories / daemon_runtime_state
 * (migration 037). Réutilise le db handle GenOS standard
 * (run/get/all/exec).
 */

const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');

const TERRITORY_STATES = [
  'BOOTSTRAPPING',
  'SURVEYING',
  'ACTIVE',
  'DORMANT',
  'STALE',
  'DEGRADED',
  'APOPTOTIC'
];

const ID_PATTERN = /^territory\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA_PATTERN = /^[a-f0-9]{40}$/;

function normalizeScopePath(scopePath) {
  if (!scopePath) return '/';
  const trimmed = String(scopePath).trim() || '/';
  if (trimmed === '/') return '/';
  const noLeading = trimmed.replace(/^\/+/, '');
  return noLeading.endsWith('/') ? noLeading : `${noLeading}/`;
}

function requiredFieldErrors(input) {
  const errors = [];
  if (!input.organizationId) errors.push('organizationId-required');
  if (!input.projectId) errors.push('projectId-required');
  if (!input.workspaceId) errors.push('workspaceId-required');
  if (!input.repoIdentity) errors.push('repoIdentity-required');
  if (!input.rootPath) errors.push('rootPath-required');
  return errors;
}

function identityErrors(input) {
  const errors = [];
  if (!ID_PATTERN.test(input.id || '')) errors.push('invalid-id');
  if (!SHA_PATTERN.test(input.headSha || '')) errors.push('invalid-headSha');
  return errors;
}

function optionalFieldErrors(input) {
  const errors = [];
  if (input.state) checkStateError(input, errors);
  if (input.parentTerritoryId) checkParentError(input, errors);
  return errors;
}

function checkStateError(input, errors) {
  if (!TERRITORY_STATES.includes(input.state)) errors.push('invalid-state');
}

function checkParentError(input, errors) {
  if (!ID_PATTERN.test(input.parentTerritoryId)) errors.push('invalid-parentTerritoryId');
}

function validateTerritoryInput(input) {
  if (!input || typeof input !== 'object') return { ok: false, errors: ['input-object-required'] };
  const errors = [
    ...identityErrors(input),
    ...requiredFieldErrors(input),
    ...optionalFieldErrors(input)
  ];
  return { ok: errors.length === 0, errors };
}

function rowToTerritory(row) {
  if (!row) return null;
  return {
    apiVersion: 'genos.daemon/v1',
    kind: 'DaemonTerritory',
    id: row.id,
    organizationId: row.organization_id,
    projectId: row.project_id,
    workspaceId: row.workspace_id,
    repoIdentity: row.repo_identity,
    rootPath: row.root_path,
    scopePath: row.scope_path,
    ref: row.ref,
    headSha: row.head_sha,
    parentTerritoryId: row.parent_territory_id || null,
    createdAt: row.created_at,
    lastObservedAt: row.last_observed_at,
    state: row.state,
    metadata: safeParse(row.metadata_json)
  };
}

function safeParse(text) {
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function ensureTables(db) {
  await migrateDaemonTerritory(db);
}

async function createTerritory(db, input) {
  const validation = validateTerritoryInput(input);
  if (!validation.ok) return { created: false, errors: validation.errors };
  await ensureTables(db);
  const scopePath = normalizeScopePath(input.scopePath);
  const state = input.state || 'BOOTSTRAPPING';
  const metadata = JSON.stringify(input.metadata || {});
  await db.run(
    `INSERT INTO daemon_territories
      (id, organization_id, project_id, workspace_id, repo_identity,
       root_path, scope_path, ref, head_sha, parent_territory_id,
       state, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    input.id,
    input.organizationId,
    input.projectId,
    input.workspaceId,
    input.repoIdentity,
    input.rootPath,
    scopePath,
    input.ref || 'main',
    input.headSha,
    input.parentTerritoryId || null,
    state,
    metadata
  );
  return getTerritory(db, { id: input.id });
}

async function getTerritory(db, query) {
  if (!db || !query || !query.id) return { found: false };
  await ensureTables(db);
  const row = await db.get('SELECT * FROM daemon_territories WHERE id = ?', query.id);
  if (!row) return { found: false };
  return { found: true, territory: rowToTerritory(row) };
}

async function listTerritories(db, filter) {
  if (!db) return [];
  await ensureTables(db);
  const clauses = [];
  const params = [];
  const scoped = filter || {};
  if (scoped.workspaceId) {
    clauses.push('workspace_id = ?');
    params.push(scoped.workspaceId);
  }
  if (scoped.repoIdentity) {
    clauses.push('repo_identity = ?');
    params.push(scoped.repoIdentity);
  }
  if (scoped.state) {
    clauses.push('state = ?');
    params.push(scoped.state);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.all(`SELECT * FROM daemon_territories ${where} ORDER BY id ASC`, ...params);
  return (rows || []).map(rowToTerritory);
}

/**
 * Avance le HEAD du territoire. Retourne previousHead pour que les
 * consommateurs (findings, graphe) marquent STALE sans transporter
 * silencieusement l'ancienne connaissance vers le nouveau commit.
 */
async function updateHead(db, change) {
  if (!db || !change || !change.id) return { updated: false };
  if (!SHA_PATTERN.test(change.headSha || '')) return { updated: false, errors: ['invalid-headSha'] };
  await ensureTables(db);
  const current = await db.get('SELECT head_sha FROM daemon_territories WHERE id = ?', change.id);
  if (!current) return { updated: false, errors: ['not-found'] };
  if (current.head_sha === change.headSha) return { updated: true, changed: false, previousHead: current.head_sha };
  await db.run(
    `UPDATE daemon_territories
     SET head_sha = ?, last_observed_at = datetime('now'),
         state = CASE WHEN state = 'ACTIVE' THEN 'STALE' ELSE state END
     WHERE id = ?`,
    change.headSha,
    change.id
  );
  return { updated: true, changed: true, previousHead: current.head_sha, headSha: change.headSha };
}

async function touchObserved(db, query) {
  if (!db || !query || !query.id) return { touched: false };
  await ensureTables(db);
  await db.run(
    "UPDATE daemon_territories SET last_observed_at = datetime('now') WHERE id = ?",
    query.id
  );
  return getTerritory(db, query);
}

/**
 * Commit-aware : une connaissance liée à findingHeadSha n'est
 * utilisable telle quelle que si le territoire est toujours sur
 * le même HEAD. Sinon → STALE (revalidation requise).
 */
function isKnowledgeStale(territory, findingHeadSha) {
  if (!territory || !findingHeadSha) return true;
  return territory.headSha !== findingHeadSha;
}

module.exports = {
  TERRITORY_STATES,
  ensureTables,
  validateTerritoryInput,
  normalizeScopePath,
  createTerritory,
  getTerritory,
  listTerritories,
  updateHead,
  touchObserved,
  isKnowledgeStale
};
