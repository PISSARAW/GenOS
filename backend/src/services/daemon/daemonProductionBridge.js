'use strict';

/**
 * Daemon Production Bridge — ADR 0034 D22 (système nerveux live).
 *
 * L'écologie daemon était une bibliothèque testée sans entrées
 * réelles. Ce pont connecte les funnels de production existants
 * (bootstrap mission, résultats de tests/builds, commits) au
 * `daemonEventBridgeService`, avec deux règles non négociables :
 *
 * 1. Lookup seule : le pont ne crée JAMAIS de territoire. Sans
 *    territoire enregistré sur le workspace → `no-territory-
 *    registered`, zéro écriture, zéro connaissance fantôme.
 *    L'installation d'un résident reste un acte opérateur explicite
 *    (CLI `genos-daemon.cjs`).
 * 2. Dégradation gracieuse : le pont ne throw JAMAIS. Daemon
 *    absent, tables absentes, bus en panne → l'orchestrateur
 *    continue exactement comme avant (Phase 28).
 */

const bridgeService = require('./daemonEventBridgeService');
const wakePolicyService = require('./daemonWakePolicyService');
const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');
const { spawnSync } = require('node:child_process');

const MAX_CHANGED_FILES = 200;
const SAFE_REPO_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.@/-]{1,240}$/;
const productionWakePolicy = wakePolicyService.createWakePolicy({});

function readWorkspaceHead(rootPath) {
  const result = spawnSync('git', ['-C', rootPath, 'rev-parse', 'HEAD'], {
    encoding: 'utf8', timeout: 3000, windowsHide: true
  });
  const headSha = (result.stdout || '').trim().toLowerCase();
  return result.status === 0 && /^[a-f0-9]{40}$/.test(headSha) ? headSha : null;
}

async function changedFilesBetween(rootPath, oldHead, newHead) {
  if (!/^[a-f0-9]{40}$/.test(oldHead || '') || !/^[a-f0-9]{40}$/.test(newHead || '')) return null;
  const result = spawnSync('git', ['-C', rootPath, 'diff', '--name-only', '--no-renames', `${oldHead}..${newHead}`], {
    encoding: 'utf8', timeout: 5000, windowsHide: true, maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) return null;
  const paths = (result.stdout || '').split(/\r?\n/).filter(Boolean);
  if (paths.length > MAX_CHANGED_FILES || paths.some((path) => !SAFE_REPO_PATH.test(path))) return null;
  return paths;
}

async function synchronizeTerritory(db, rootPath, territoryId) {
  const row = await db.get('SELECT head_sha FROM daemon_territories WHERE id = ?', territoryId);
  const workspaceHead = readWorkspaceHead(rootPath);
  if (!row || !workspaceHead) return { synchronized: false, reason: 'head-unavailable' };
  if (row.head_sha === workspaceHead) return { synchronized: true, headSha: workspaceHead, changedFiles: [] };
  const changedFiles = await changedFilesBetween(rootPath, row.head_sha, workspaceHead);
  if (!changedFiles) return { synchronized: false, reason: 'refresh-unavailable', daemonHead: row.head_sha, workspaceHead };
  const updated = await emitTerritoryEvent(db, {
    rootPath, type: 'TERRITORY_COMMIT', headSha: workspaceHead,
    payload: { changedFiles },
  });
  return updated.emitted
    ? { synchronized: true, headSha: workspaceHead, changedFiles }
    : { synchronized: false, reason: updated.reason || 'refresh-failed' };
}

async function resolveTerritoryByRoot(db, rootPath) {
  try {
    await migrateDaemonTerritory(db);
    const row = await db.get('SELECT id FROM daemon_territories WHERE root_path = ?', rootPath);
    return (row && row.id) || null;
  } catch (_) {
    return null;
  }
}

async function emitTerritoryEvent(db, event) {
  try {
    if (!db || !event || !event.rootPath || !event.type) return { emitted: false, reason: 'args-required' };
    const territoryId = await resolveTerritoryByRoot(db, event.rootPath);
    if (!territoryId) return { emitted: false, reason: 'no-territory-registered' };
    const bridge = bridgeService.createBridge({ db, policy: productionWakePolicy });
    const ingested = await bridgeService.ingestEvent(bridge, {
      type: event.type,
      territoryId,
      headSha: event.headSha,
      rootPath: event.rootPath,
      payload: event.payload || {}
    });
    const applied = ingested.cheapUpdate?.applied !== false;
    return { emitted: ingested.ingested === true && applied, territoryId, ...ingested };
  } catch (_) {
    return { emitted: false, reason: 'bridge-error' };
  }
}

function candidateRoots(input) {
  const roots = [];
  if (input.request) {
    const direct = input.request.workspacePath || input.request.workspace_path;
    if (direct) roots.push(direct);
  }
  if (input.repoRoot) roots.push(input.repoRoot);
  return roots;
}

async function announceMissionStart(input) {
  try {
    if (!input || !input.db) return { announced: false, reason: 'args-required' };
    for (const root of candidateRoots(input)) {
      const territoryId = await resolveTerritoryByRoot(input.db, root);
      if (!territoryId) continue;
      const synchronization = await synchronizeTerritory(input.db, root, territoryId);
      const emitted = await emitTerritoryEvent(input.db, {
        rootPath: root,
        type: 'ORCHESTRATOR_ENTERED',
        payload: missionPayload(input.request)
      });
      if (emitted.emitted) return {
        announced: true, territoryId: emitted.territoryId, rootPath: root,
        synchronization
      };
    }
    return { announced: false, reason: 'no-territory-registered' };
  } catch (_) {
    return { announced: false, reason: 'bridge-error' };
  }
}

function missionPayload(request) {
  if (!request || typeof request !== 'object') return {};
  const mission = request.mission || request.task || null;
  return mission ? { mission: String(mission).slice(0, 500) } : {};
}

async function recordTestOutcome(db, outcome) {
  if (!db || !outcome || !outcome.rootPath) return { emitted: false, reason: 'args-required' };
  return emitTerritoryEvent(db, {
    rootPath: outcome.rootPath,
    type: outcome.passed ? 'TEST_RECOVERED' : 'TEST_FAILED',
    payload: { file: outcome.scope || 'unknown' }
  });
}

async function recordBuildFailed(db, outcome) {
  if (!db || !outcome || !outcome.rootPath) return { emitted: false, reason: 'args-required' };
  return emitTerritoryEvent(db, {
    rootPath: outcome.rootPath,
    type: 'BUILD_FAILED',
    payload: { scope: outcome.scope || 'unknown' }
  });
}

async function recordCommit(db, outcome) {
  if (!db || !outcome || !outcome.rootPath) return { emitted: false, reason: 'args-required' };
  return emitTerritoryEvent(db, {
    rootPath: outcome.rootPath,
    type: 'TERRITORY_COMMIT',
    headSha: outcome.headSha,
    payload: { changedFiles: Array.isArray(outcome.changedFiles) ? outcome.changedFiles : [] }
  });
}

module.exports = {
  resolveTerritoryByRoot,
  emitTerritoryEvent,
  announceMissionStart,
  recordTestOutcome,
  recordBuildFailed,
  recordCommit
};
