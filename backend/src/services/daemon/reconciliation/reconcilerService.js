'use strict';

/**
 * Reconciler — autophagie continue (ADR 0034 D13/D22 v2).
 *
 * Rien n'est supprimé brutalement : l'expiration déclarée fait
 * foi (expires_at du finding, TTL du handoff), la rétention du
 * journal est bornée, la stigmergie s'évapore. Chaque action est
 * comptée dans le reçu de sweep — traçabilité sans provenance
 * lourde (aucune mutation de connaissance, que du ménage).
 *
 * Deux vitesses (D22) : les tables daemon_* possédées sont mutées
 * (épisodes orphelins de finding réfuté, briefs à HEAD périmé,
 * arêtes pendantes du graphe dérivé) ; les ressources étrangères
 * (agents bloqués, runtimes stales, workspaces orphelins, capsules
 * coincées, branches abandonnées) sont fichées SUSPECT avec grace
 * period — jamais mutées, l'owner agit.
 * D14 : les épisodes de repair persistés sont expirés ici
 * (OPEN/CLAIMED au-delà de expires_at → EXPIRED).
 */

const stigmergyService = require('../daemonStigmergyService');
const repairService = require('../repair/repairEpisodeService');
const territoryService = require('../daemonTerritoryService');
const suspects = require('./suspectService');

const DEFAULT_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EVAPORATION_RATE = 0.2;
const DEFAULT_SUSPECT_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

async function expireFindings(db, scope) {
  try {
    const res = await db.run(
      `UPDATE daemon_findings SET status = 'EXPIRED', updated_at = datetime('now')
       WHERE territory_id = ? AND expires_at IS NOT NULL
         AND datetime(expires_at) <= datetime(?)
         AND status NOT IN ('REFUTED', 'EXPIRED')`,
      scope.territoryId,
      scope.nowIso
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

async function pruneEvents(db, scope) {
  try {
    const cutoff = new Date(scope.now - scope.eventRetentionMs).toISOString();
    const res = await db.run(
      'DELETE FROM daemon_events WHERE territory_id = ? AND datetime(created_at) < datetime(?)',
      scope.territoryId,
      cutoff
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

async function expireHandoffs(db, scope) {
  try {
    const cutoff = new Date(scope.now - scope.handoffTtlMs).toISOString();
    const res = await db.run(
      `UPDATE daemon_handoffs SET status = 'EXPIRED'
       WHERE territory_id = ? AND status = 'READY' AND datetime(created_at) < datetime(?)`,
      scope.territoryId,
      cutoff
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

async function sweep(db, args) {
  if (!db || !args || !args.territoryId) return { swept: false, reason: 'args-required' };
  const now = args.now || Date.now();
  const scope = {
    territoryId: args.territoryId,
    now,
    nowIso: new Date(now).toISOString(),
    eventRetentionMs: args.eventRetentionMs || DEFAULT_EVENT_RETENTION_MS,
    handoffTtlMs: args.handoffTtlMs || DEFAULT_HANDOFF_TTL_MS,
    suspectGraceMs: args.suspectGraceMs || DEFAULT_SUSPECT_GRACE_MS
  };
  const evaporated = await stigmergyService.evaporateMarkers(db, {
    territoryId: args.territoryId,
    rate: args.evaporationRate || DEFAULT_EVAPORATION_RATE
  });
  const suspectReceipt = await reviewSuspects(db, scope);
  return {
    swept: true,
    territoryId: args.territoryId,
    sweptAt: scope.nowIso,
    expiredFindings: await expireFindings(db, scope),
    prunedEvents: await pruneEvents(db, scope),
    expiredHandoffs: await expireHandoffs(db, scope),
    evaporatedMarkers: evaporated.evaporated,
    expiredRepairs: (await repairService.expireEpisodes(db, scope)).expired,
    expiredOrphanEpisodes: await expireOrphanedEpisodes(db, scope),
    expiredStaleBriefs: await expireStaleHeadBriefs(db, scope),
    prunedDanglingEdges: await pruneDanglingEdges(db, scope),
    newSuspects: suspectReceipt.isNew,
    resolvedSuspects: suspectReceipt.resolved,
    pendingSuspects: suspectReceipt.pending
  };
}

/**
 * Épisode OPEN/CLAIMED dont le finding est terminal (REFUTED/
 * EXPIRED) : la liveness a définitivement échoué → EXPIRE
 * (pas de grace : la preuve terminale fait foi).
 */
async function expireOrphanedEpisodes(db, scope) {
  try {
    const res = await db.run(
      `UPDATE daemon_repair_episodes SET status = 'EXPIRED', updated_at = datetime('now')
       WHERE territory_id = ? AND status IN ('OPEN', 'CLAIMED')
       AND finding_id IN (SELECT id FROM daemon_findings WHERE status IN ('REFUTED', 'EXPIRED'))`,
      scope.territoryId
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Brief READY compilé sur un HEAD dépassé : le dossier reste en
 * ligne (brief_json conservé) mais n'est plus servi → EXPIRED.
 */
async function expireStaleHeadBriefs(db, scope) {
  try {
    const stored = await territoryService.getTerritory(db, { id: scope.territoryId });
    if (!stored.found) return 0;
    const res = await db.run(
      `UPDATE daemon_handoffs SET status = 'EXPIRED'
       WHERE territory_id = ? AND status = 'READY' AND head_sha != ?`,
      scope.territoryId,
      stored.territory.headSha
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Arêtes dont une extrémité a disparu : le graphe est un index
 * dérivé reconstructible, ces fragments ne portent rien.
 */
async function pruneDanglingEdges(db, scope) {
  try {
    const res = await db.run(
      `DELETE FROM territory_graph_edges WHERE territory_id = ?
       AND (source_id NOT IN (SELECT id FROM territory_graph_nodes WHERE territory_id = ?)
         OR target_id NOT IN (SELECT id FROM territory_graph_nodes WHERE territory_id = ?))`,
      scope.territoryId,
      scope.territoryId,
      scope.territoryId
    );
    return (res && res.changes) || 0;
  } catch (_) {
    return 0;
  }
}

async function reviewSuspects(db, scope) {
  const cutoffIso = new Date(scope.now - scope.suspectGraceMs).toISOString();
  const receipt = { isNew: 0, resolved: 0, pending: 0 };
  for (const kind of suspects.KINDS) {
    const actives = await detectKind(db, { scope, kind, cutoffIso });
    await reviewKind(db, { scope, kind, actives, receipt });
  }
  return receipt;
}

async function detectKind(db, job) {
  const { scope, kind, cutoffIso } = job;
  if (kind === 'blocked-agent') return suspects.findBlockedAgents(db, cutoffIso);
  if (kind === 'stale-runtime') return suspects.findStaleRuntimes(db, cutoffIso);
  if (kind === 'orphan-workspace') return suspects.findOrphanWorkspaces(db, cutoffIso);
  if (kind === 'stuck-capsule') return suspects.findStuckCapsules(db, cutoffIso);
  return suspects.findAbandonedBranches(db, { territoryId: scope.territoryId, cutoffIso });
}

async function reviewKind(db, job) {
  const { scope, kind, actives, receipt } = job;
  const alive = new Set((actives || []).map((row) => row.id));
  for (const row of actives || []) {
    const seen = await suspects.upsertSuspect(db, {
      territoryId: scope.territoryId,
      kind,
      ref: row.id,
      detail: { branch: row.branch_name || null }
    });
    if (seen.isNew) receipt.isNew += 1;
  }
  const open = await suspects.listSuspects(db, { territoryId: scope.territoryId, status: 'SUSPECT' });
  for (const suspect of (open || []).filter((s) => s.kind === kind)) {
    if (!alive.has(suspect.ref)) {
      const done = await suspects.markResolved(db, { territoryId: scope.territoryId, kind, ref: suspect.ref });
      if (done.resolved) receipt.resolved += 1;
    } else {
      receipt.pending += 1;
    }
  }
}

module.exports = {
  sweep,
  expireOrphanedEpisodes,
  expireStaleHeadBriefs,
  pruneDanglingEdges,
  reviewSuspects,
  DEFAULT_EVENT_RETENTION_MS,
  DEFAULT_HANDOFF_TTL_MS,
  DEFAULT_EVAPORATION_RATE,
  DEFAULT_SUSPECT_GRACE_MS
};
