'use strict';
function rankingArguments(context) {
  const scores = context.payload.scores;
  if (!Array.isArray(scores) || !scores.length) return null;
  const candidates = [];
  const ids = new Set();
  for (const item of scores) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) return null;
    if (typeof item.score !== 'number' || !Number.isFinite(item.score) || ids.has(item.id)) return null;
    ids.add(item.id);
    candidates.push({ id: item.id, score: item.score });
  }
  return { primitive_name: 'rank_states', args: { candidates } };
}
module.exports = { rankingArguments };
