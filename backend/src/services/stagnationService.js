'use strict';

/**
 * Signal de stagnation cognitive (instinct créatif, best-effort).
 *
 * Ne dit jamais quelle est la solution : dit quand arrêter de chercher dans
 * le même espace. Trois signaux mesurés, seuils documentés :
 * - échecs répétés : runs terminaux failed/blocked/cancelled ≥ 0,6 (10 derniers) ;
 * - surprise persistante : surprise moyenne des transitions résolues ≥ 0,6 (≥ 5) ;
 * - nouveauté basse : saillance moyenne des épisodes récents < 0,4 (≥ 5).
 * Joint au plan (autonomyPlan.stagnationSignal) ; l'orchestrateur décide.
 */

const { AdaptiveStateService } = require('./adaptiveStateService');

const FAILURE_STATUSES = new Set(['failed', 'blocked', 'cancelled']);
const RECENT_RUNS = 10;
const FAILURE_AT = 0.6;
const SURPRISE_AT = 0.6;
const SURPRISE_MIN = 5;
const NOVELTY_BELOW = 0.4;
const NOVELTY_MIN = 5;

async function failureRate(db, agentId) {
  const rows = await db.all(
    `SELECT status FROM strategy_execution_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ${RECENT_RUNS}`,
    agentId
  );
  if (!rows.length) return null;
  const failed = rows.filter((row) => FAILURE_STATUSES.has(String(row.status))).length;
  return failed / rows.length;
}

async function meanSurprise(db, agentId) {
  const store = new AdaptiveStateService(db);
  const stored = (await store.restoreObject('world_model', agentId)) || {};
  const resolved = (Array.isArray(stored.transitions) ? stored.transitions : [])
    .filter((entry) => entry.status === 'resolved' && Number.isFinite(Number(entry.surprise)));
  if (resolved.length < SURPRISE_MIN) return null;
  return {
    mean: resolved.reduce((total, entry) => total + Number(entry.surprise), 0) / resolved.length,
    n: resolved.length
  };
}

async function meanNovelty(db, agentId) {
  const episodeStore = require('./autobiographicalMemory/episodeStore');
  const episodes = await episodeStore.getRecentEpisodes({ agentId, limit: NOVELTY_MIN }, db);
  if (episodes.length < NOVELTY_MIN) return null;
  return {
    mean: episodes.reduce((total, episode) => total + (Number(episode.salience) || 0), 0) / episodes.length,
    n: episodes.length
  };
}

async function detectStagnation(db, agentId, options) {
  const settings = options || {};
  const signals = {};
  const reasons = [];
  if (!db || !agentId) return { stagnant: false, reasons: ['missing agent'], signals };
  try {
    const failures = await failureRate(db, agentId).catch(() => null);
    signals.failureRate = failures;
    if (failures !== null && failures >= (Number(settings.failureAt) || FAILURE_AT)) reasons.push('repeated_failure');
    const surprise = await meanSurprise(db, agentId).catch(() => null);
    signals.meanSurprise = surprise?.mean ?? null;
    if (surprise && surprise.mean >= SURPRISE_AT) reasons.push('surprise_plateau');
    const novelty = await meanNovelty(db, agentId).catch(() => null);
    signals.meanNovelty = novelty?.mean ?? null;
    if (novelty && novelty.mean < NOVELTY_BELOW) reasons.push('low_novelty');
    return { stagnant: reasons.length > 0, reasons, signals };
  } catch (_) {
    return { stagnant: false, reasons: ['unavailable'], signals };
  }
}

module.exports = { detectStagnation };
