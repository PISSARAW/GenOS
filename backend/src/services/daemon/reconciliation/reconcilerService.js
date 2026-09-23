'use strict';

/**
 * Reconciler — autophagie continue (ADR 0034 D13 v1).
 *
 * Rien n'est supprimé brutalement : l'expiration déclarée fait
 * foi (expires_at du finding, TTL du handoff), la rétention du
 * journal est bornée, la stigmergie s'évapore. Chaque action est
 * comptée dans le reçu de sweep — traçabilité sans provenance
 * lourde (aucune mutation de connaissance, que du ménage).
 *
 * Hors scope v1 (aucune table ne les piste encore) : PIDs stale,
 * capsules/worktrees orphelins, leases, branches de repair
 * abandonnées — le sweep les couvrira quand D14+ les persistera.
 * D14 : les épisodes de repair persistés sont expirés ici
 * (OPEN/CLAIMED au-delà de expires_at → EXPIRED).
 */

const stigmergyService = require('../daemonStigmergyService');
const repairService = require('../repair/repairEpisodeService');

const DEFAULT_EVENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_HANDOFF_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_EVAPORATION_RATE = 0.2;

async function expireFindings(db, scope) {
  const res = await db.run(
    `UPDATE daemon_findings SET status = 'EXPIRED', updated_at = datetime('now')
     WHERE territory_id = ? AND expires_at IS NOT NULL
       AND datetime(expires_at) <= datetime(?)
       AND status NOT IN ('REFUTED', 'EXPIRED')`,
    scope.territoryId,
    scope.nowIso
  );
  return (res && res.changes) || 0;
}

async function pruneEvents(db, scope) {
  const cutoff = new Date(scope.now - scope.eventRetentionMs).toISOString();
  const res = await db.run(
    'DELETE FROM daemon_events WHERE territory_id = ? AND datetime(created_at) < datetime(?)',
    scope.territoryId,
    cutoff
  );
  return (res && res.changes) || 0;
}

async function expireHandoffs(db, scope) {
  const cutoff = new Date(scope.now - scope.handoffTtlMs).toISOString();
  const res = await db.run(
    `UPDATE daemon_handoffs SET status = 'EXPIRED'
     WHERE territory_id = ? AND status = 'READY' AND datetime(created_at) < datetime(?)`,
    scope.territoryId,
    cutoff
  );
  return (res && res.changes) || 0;
}

async function sweep(db, args) {
  if (!db || !args || !args.territoryId) return { swept: false, reason: 'args-required' };
  const now = args.now || Date.now();
  const scope = {
    territoryId: args.territoryId,
    now,
    nowIso: new Date(now).toISOString(),
    eventRetentionMs: args.eventRetentionMs || DEFAULT_EVENT_RETENTION_MS,
    handoffTtlMs: args.handoffTtlMs || DEFAULT_HANDOFF_TTL_MS
  };
  const evaporated = await stigmergyService.evaporateMarkers(db, {
    territoryId: args.territoryId,
    rate: args.evaporationRate || DEFAULT_EVAPORATION_RATE
  });
  return {
    swept: true,
    territoryId: args.territoryId,
    sweptAt: scope.nowIso,
    expiredFindings: await expireFindings(db, scope),
    prunedEvents: await pruneEvents(db, scope),
    expiredHandoffs: await expireHandoffs(db, scope),
    evaporatedMarkers: evaporated.evaporated,
    expiredRepairs: (await repairService.expireEpisodes(db, scope)).expired
  };
}

module.exports = {
  sweep,
  DEFAULT_EVENT_RETENTION_MS,
  DEFAULT_HANDOFF_TTL_MS,
  DEFAULT_EVAPORATION_RATE
};
