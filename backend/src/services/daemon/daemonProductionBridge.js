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
const { migrateDaemonTerritory } = require('../../db/migrations/migrateDaemonTerritory');

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
    const bridge = bridgeService.createBridge({ db });
    const ingested = await bridgeService.ingestEvent(bridge, {
      type: event.type,
      territoryId,
      headSha: event.headSha,
      payload: event.payload || {}
    });
    return { emitted: ingested.ingested === true, territoryId, ...ingested };
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
      const emitted = await emitTerritoryEvent(input.db, {
        rootPath: root,
        type: 'ORCHESTRATOR_ENTERED',
        payload: missionPayload(input.request)
      });
      if (emitted.emitted) return { announced: true, territoryId: emitted.territoryId, rootPath: root };
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
    payload: {}
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
