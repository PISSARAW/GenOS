'use strict';

const crypto = require('crypto');

/**
 * Journal rejouable et analytique des coûts (roadmap §P5).
 * Append-only séquentiel par projet : rejouer depuis seq N rejoue
 * l'histoire sans réécrire le passé. Dépenses cumulées comparées
 * aux budgets configurés pour le chargeback et les alertes.
 */

async function nextSeq(db, projectId) {
  const row = await db.get('SELECT COALESCE(MAX(seq), 0) AS last FROM ontogenesis_ledger WHERE project_id = ?', [projectId]);
  return (row ? row.last : 0) + 1;
}

async function appendEntry(db, input) {
  const seq = await nextSeq(db, input.projectId);
  const id = input.id || `led_${crypto.randomUUID()}`;
  await db.run(
    `INSERT INTO ontogenesis_ledger (id, project_id, seq, kind, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.projectId, seq, input.kind, JSON.stringify(input.payload || {})]
  );
  return { id, seq };
}

async function listSince(db, input) {
  const since = input.sinceSeq || 0;
  return db.all(
    `SELECT * FROM ontogenesis_ledger WHERE project_id = ? AND seq > ?
     ORDER BY seq ASC LIMIT ?`,
    [input.projectId, since, input.limit || 500]
  );
}

function zeroSpend() {
  return { tokens: 0, usd: 0, seconds: 0 };
}

async function recordSpend(db, input) {
  const prior = await getSpend(db, input.projectId);
  const tokens = prior.tokens + (input.tokens || 0);
  const usd = prior.usd + (input.usd || 0);
  const seconds = prior.seconds + (input.seconds || 0);
  await db.run(
    `INSERT INTO ontogenesis_spend (project_id, tokens, usd, seconds, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(project_id) DO UPDATE SET tokens = ?, usd = ?, seconds = ?, updated_at = datetime('now')`,
    [input.projectId, tokens, usd, seconds, tokens, usd, seconds]
  );
  return { tokens, usd, seconds };
}

async function getSpend(db, projectId) {
  const row = await db.get('SELECT * FROM ontogenesis_spend WHERE project_id = ?', [projectId]);
  if (!row) return zeroSpend();
  return { tokens: row.tokens, usd: row.usd, seconds: row.seconds };
}

function overrunOf(budgets, spend, key) {
  if (budgets && budgets[key] > 0 && spend[key] > budgets[key]) return key;
  return null;
}

function spendVsBudget(budgets, spend) {
  const overruns = ['tokens', 'usd', 'seconds'].map((key) => overrunOf(budgets, spend, key)).filter(Boolean);
  return { within: overruns.length === 0, overruns };
}

module.exports = { appendEntry, listSince, recordSpend, getSpend, spendVsBudget };
