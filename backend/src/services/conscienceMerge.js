/**
 * GenOS conscience conflict merge — most-recent-wins.
 *
 * DOCUMENTED POLICY: when two writers race on the same agent row, the
 * revision whose row stamp (updated_at, tie-broken by conscience_revision)
 * is the most recent wins INTEGRALLY: the whole winning snapshot is adopted
 * into the in-memory state. There is deliberately no field-wise max()/min()
 * ratchet and no averaging, because mixing halves of two concurrent
 * evaluations produced phantom dissonance/budget pairs that belonged to
 * neither evaluation. The loser re-runs its evaluation on top of the fresh
 * state on its next tick (persist retries once after adopting).
 */

function rowTimeMs(row) {
  const raw = row && row.updated_at ? String(row.updated_at) : '';
  const iso = raw.replace(' ', 'T');
  const zoned = iso.endsWith('Z') ? iso : iso + 'Z';
  const ms = Date.parse(zoned);
  if (Number.isFinite(ms)) return ms;
  return 0;
}

function rowRevision(row) {
  const rev = row ? Math.floor(Number(row.conscience_revision)) : NaN;
  if (Number.isFinite(rev)) return Math.max(0, rev);
  return 0;
}

function pickWinningSnapshot(previous, current) {
  const prevTime = rowTimeMs(previous);
  const currTime = rowTimeMs(current);
  if (currTime !== prevTime) {
    if (currTime > prevTime) return 'current';
    return 'previous';
  }
  if (rowRevision(current) > rowRevision(previous)) return 'current';
  return 'previous';
}

function adoptSnapshot(state, row) {
  state.dissonanceLevel = Math.max(0, Number(row.dissonance_level) || 0);
  state.eurekaMoments = Math.max(0, Math.floor(Number(row.eureka_count) || 0));
  state.currentBudget = Math.max(0, Number(row.cognitive_budget) || 0);
  state.baselineBudget = Math.max(0, Number(row.cognitive_baseline_budget) || 0);
  state.maxDissonanceThreshold = Math.max(0.000001, Number(row.cognitive_max_dissonance) || 50);
  state.isApoptotic = Boolean(row.is_apoptotic);
}

function resolveConflictIntoState(state, previous, current) {
  const winner = pickWinningSnapshot(previous, current);
  if (winner === 'current') adoptSnapshot(state, current);
  state.revision = rowRevision(current);
  return winner;
}

module.exports = { rowTimeMs, rowRevision, pickWinningSnapshot, adoptSnapshot, resolveConflictIntoState };
