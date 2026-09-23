'use strict';

/**
 * Handoff Feedback — ADR 0034 D12.
 *
 * Boucle d'apprentissage de la passation : chaque verdict
 * orchestrateur est persisté, usefulness() agrège par finding,
 * relevanceScore() convertit en signal de plasticité :
 * présenté ≥ 8 fois sans usage → demote (le compilateur D11
 * l'ordonnera plus bas / l'exclura). Un finding DECISIVE qui
 * mène à une réparation vérifiée renforce le chemin.
 */

const { migrateDaemonHandoffFeedback } = require('../../../db/migrations/migrateDaemonHandoffFeedback');
const { migrateDaemonHandoffs } = require('../../../db/migrations/migrateDaemonHandoffs');
const plasticity = require('../../synapticPlasticityService');

const VERDICTS = ['USED', 'DECISIVE', 'IRRELEVANT', 'STALE', 'WRONG', 'INCOMPLETE'];
const DEMOTE_AFTER_PRESENTATIONS = 8;

async function recordFeedback(db, input) {
  if (!db || !input || !input.briefId || !input.findingId) return { recorded: false, reason: 'args-required' };
  if (!VERDICTS.includes(input.verdict)) return { recorded: false, reason: 'invalid-verdict' };
  await migrateDaemonHandoffFeedback(db);
  await migrateDaemonHandoffs(db);
  const brief = await db.get('SELECT id FROM daemon_handoffs WHERE id = ?', input.briefId);
  if (!brief) return { recorded: false, reason: 'unknown-brief' };
  await db.run(
    'INSERT INTO daemon_handoff_feedback (brief_id, finding_id, verdict) VALUES (?, ?, ?)',
    input.briefId,
    input.findingId,
    input.verdict
  );
  maybePlasticitySignal(input);
  return { recorded: true, briefId: input.briefId, findingId: input.findingId, verdict: input.verdict };
}

function maybePlasticitySignal(input) {
  const outcomes = {
    DECISIVE: 'state_changed',
    USED: 'state_changed',
    WRONG: 'ignored',
    STALE: 'ignored'
  };
  const outcome = outcomes[input.verdict];
  if (!outcome) return;
  plasticity.recordSignalOutcome({ senderId: input.findingId, receiverId: input.briefId, outcome, signalType: 'handoff' });
}

async function usefulness(db, query) {
  if (!db || !query || !query.findingId) return emptyUsefulness();
  await migrateDaemonHandoffFeedback(db);
  const rows = await db.all(
    'SELECT verdict, COUNT(*) as n FROM daemon_handoff_feedback WHERE finding_id = ? GROUP BY verdict',
    query.findingId
  );
  return countsFromRows(rows);
}

function emptyUsefulness() {
  return { used: 0, decisive: 0, irrelevant: 0, stale: 0, wrong: 0, incomplete: 0, presentations: 0 };
}

function countsFromRows(rows) {
  const counts = emptyUsefulness();
  for (const row of rows || []) {
    const key = String(row.verdict || '').toLowerCase();
    if (key in counts) counts[key] = Number(row.n) || 0;
  }
  counts.presentations = counts.used + counts.decisive + counts.irrelevant + counts.stale + counts.wrong + counts.incomplete;
  return counts;
}

function relevanceScore(counts) {
  const c = counts || emptyUsefulness();
  const score = 2 * c.decisive + c.used - c.irrelevant - c.stale - 2 * c.wrong - 0.5 * c.incomplete;
  const presentations = c.presentations || 0;
  const everUseful = c.used + c.decisive > 0;
  return {
    score: Number(score.toFixed(3)),
    presentations,
    demote: presentations >= DEMOTE_AFTER_PRESENTATIONS && !everUseful,
    decisiveRate: presentations > 0 ? Number((c.decisive / presentations).toFixed(3)) : 0
  };
}

async function markBriefConsumed(db, query) {
  if (!db || !query || !query.briefId) return { consumed: false };
  await migrateDaemonHandoffs(db);
  await db.run(
    "UPDATE daemon_handoffs SET status = 'CONSUMED', consumed_at = datetime('now') WHERE id = ? AND status = 'READY'",
    query.briefId
  );
  return { consumed: true, briefId: query.briefId };
}

module.exports = {
  VERDICTS,
  DEMOTE_AFTER_PRESENTATIONS,
  recordFeedback,
  usefulness,
  relevanceScore,
  markBriefConsumed
};
