'use strict';

const { HypothesisLedger } = require('../search/hypothesisLedgerService');
const { SearchPressureModel } = require('../search/searchPressureService');
const adapter = require('./daemonNaturalSearchAdapter');

async function ensure(context) {
  if (context.searchStateLoaded) return;
  await context.db.exec(`CREATE TABLE IF NOT EXISTS daemon_search_state (
    daemon_id TEXT PRIMARY KEY, territory_id TEXT NOT NULL, ledger_json TEXT NOT NULL,
    pressure_json TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  const row = await context.db.get('SELECT * FROM daemon_search_state WHERE daemon_id = ?', context.daemonId);
  context.ledger ||= new HypothesisLedger();
  context.pressureModel ||= new SearchPressureModel();
  if (row && row.territory_id === context.territoryId) {
    const saved = JSON.parse(row.ledger_json);
    context.ledger.load(saved);
    context.retryInvestigation = saved.retryInvestigation === true;
    Object.assign(context.pressureModel, JSON.parse(row.pressure_json));
  }
  context.searchStateLoaded = true;
}

async function update(context) {
  const rows = await context.db.all(`SELECT event_type, COUNT(*) AS n FROM daemon_events
    WHERE territory_id = ? AND datetime(created_at) >= datetime('now', '-1 hour') GROUP BY event_type`, context.territoryId);
  const counts = Object.fromEntries(rows.map((row) => [row.event_type, row.n]));
  return adapter.reportTerritoryPressure(context.pressureModel, {
    repeatedFailures: counts.TEST_FAILED || 0, refutedFindings: counts.FINDING_REFUTED || 0,
    contradictingEvidence: counts.FINDING_CONTRADICTED || 0
  });
}

async function save(context) {
  if (!context.searchStateLoaded) return;
  await context.db.run(`INSERT INTO daemon_search_state (daemon_id, territory_id, ledger_json, pressure_json)
    VALUES (?, ?, ?, ?) ON CONFLICT(daemon_id) DO UPDATE SET ledger_json = excluded.ledger_json,
    pressure_json = excluded.pressure_json, updated_at = CURRENT_TIMESTAMP`,
  context.daemonId, context.territoryId, JSON.stringify({ ...context.ledger.save(), retryInvestigation: context.retryInvestigation === true }), JSON.stringify(context.pressureModel.report()));
}

module.exports = { ensure, update, save };
