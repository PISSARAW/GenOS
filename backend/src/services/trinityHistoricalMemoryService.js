'use strict';

const MEMORY_LIMIT = 20;
const DECIDED_STATES = ['decided', 'promoted', 'escalated', 'rejected', 'promotion_failed'];

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch { return {}; }
}

function outcomeOf(row) {
  return parseJson(row.decision_json).outcome || row.status || 'unknown';
}

function summarize(rows) {
  const outcomeCounts = {};
  for (const row of rows) {
    const outcome = outcomeOf(row);
    outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
  }
  return { version: 1, sampleSize: rows.length, outcomeCounts };
}

async function attach(db, input) {
  const existing = await db.get('SELECT design_json FROM trinity_experiments WHERE id = ?', input.experimentId);
  if (existing) return parseJson(existing.design_json);
  const placeholders = DECIDED_STATES.map(() => '?').join(', ');
  const rows = await db.all(
    `SELECT status, decision_json FROM trinity_experiments
     WHERE domain = ? AND id != ? AND status IN (${placeholders})
     ORDER BY updated_at DESC LIMIT ?`,
    input.domain, input.experimentId, ...DECIDED_STATES, MEMORY_LIMIT
  );
  return { ...input.design, historicalMemory: summarize(rows) };
}

module.exports = { attach, summarize };
