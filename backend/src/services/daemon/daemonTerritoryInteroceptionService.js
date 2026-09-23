'use strict';

/**
 * Daemon Territory Interoception — ADR 0034 D4.
 *
 * Le daemon RESSENT son territoire au lieu de recevoir des valeurs
 * arbitraires : chaque variable est DÉRIVÉE de mesures (journal
 * daemon_events, ligne daemon_territories), jamais fournie par LLM.
 *
 * Variables mesurées en v1 : change_rate, test_failure_pressure,
 * build_failure_pressure, knowledge_staleness, handoff_demand,
 * orphan_pressure. Les autres (graph_coverage, findings, drift...)
 * sont déclarées dans `deferred` jusqu'à D5/D6 — pas de valeur
 * fantôme, l'absence de mesure est explicite.
 *
 * Homéostasie daemon = combinePressures(territoryVars, machineVars)
 * où machineVars vient de machineInteroceptionService (existant).
 */

const { migrateDaemonEvents } = require('../../db/migrations/migrateDaemonEvents');

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const STALE_AFTER_MS = 60 * 60 * 1000;

const MEASURED = [
  'change_rate',
  'test_failure_pressure',
  'build_failure_pressure',
  'knowledge_staleness',
  'handoff_demand',
  'orphan_pressure'
];

const DEFERRED = [
  'graph_coverage',
  'graph_invalidations',
  'unresolved_findings',
  'refuted_findings',
  'dependency_churn',
  'contract_drift',
  'documentation_drift',
  'handoff_usefulness',
  'cpu_pressure',
  'inference_pressure'
];

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function countOf(counts, eventType) {
  return Number((counts || {})[eventType] || 0);
}

async function sampleTerritory(db, territoryId, options) {
  const opts = options || {};
  const now = opts.now || Date.now();
  const windowMs = opts.windowMs || DEFAULT_WINDOW_MS;
  await migrateDaemonEvents(db);
  const since = new Date(now - windowMs).toISOString();
  const [territory, counts] = await Promise.all([
    db.get('SELECT * FROM daemon_territories WHERE id = ?', territoryId),
    db.all(
      `SELECT event_type, COUNT(*) as n FROM daemon_events
       WHERE territory_id = ? AND datetime(created_at) >= datetime(?)
       GROUP BY event_type`,
      territoryId,
      since
    )
  ]);
  const byType = {};
  (counts || []).forEach((row) => { byType[row.event_type] = Number(row.n) || 0; });
  return { territory: territory || null, counts: byType, now, windowMs };
}

function parseObservedAt(value) {
  const text = String(value || '');
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) return Date.parse(`${text.replace(' ', 'T')}Z`) || 0;
  return Date.parse(text) || 0;
}

function stalenessOf(territoryRow, now) {
  if (!territoryRow) return 1;
  const last = parseObservedAt(territoryRow.last_observed_at);
  const age = clamp01((now - last) / STALE_AFTER_MS);
  if (territoryRow.state === 'STALE' || territoryRow.state === 'DEGRADED') return Math.max(age, 0.7);
  return age;
}

function deriveTerritoryVariables(sample) {
  const counts = sample.counts || {};
  const changes = countOf(counts, 'TERRITORY_FILE_CHANGED') + 2 * countOf(counts, 'TERRITORY_COMMIT');
  return {
    change_rate: clamp01(changes / 10),
    test_failure_pressure: clamp01(countOf(counts, 'TEST_FAILED') / 5),
    build_failure_pressure: clamp01(countOf(counts, 'BUILD_FAILED') / 5),
    knowledge_staleness: stalenessOf(sample.territory, sample.now),
    handoff_demand: clamp01(countOf(counts, 'ORCHESTRATOR_ENTERED') / 3),
    orphan_pressure: clamp01(countOf(counts, 'RESOURCE_ORPHANED') / 3)
  };
}

/**
 * Homéostasie : combine l'interoception du territoire avec
 * l'interoception machine (senseAgentRuntime). Exemple canonique :
 * change_rate + staleness hauts → cartographyPressure haute, MAIS
 * machine stressée → deferReasoning (le raisonnement sémantique
 * coûteux attend une fenêtre idle).
 */
function combinePressures(territoryVars, machineVars) {
  const t = territoryVars || {};
  const m = machineVars || {};
  const cartographyPressure = clamp01(0.5 * (t.change_rate || 0) + 0.5 * (t.knowledge_staleness || 0));
  const wakeUrgency = Math.max(t.test_failure_pressure || 0, t.build_failure_pressure || 0, t.orphan_pressure || 0);
  return {
    cartographyPressure,
    wakeUrgency: clamp01(wakeUrgency),
    deferReasoning: shouldDeferReasoning(m),
    rationale: 'cartography=f(change_rate,staleness); defer=f(machine stress,context,drift)'
  };
}

function shouldDeferReasoning(machineVars) {
  if ((machineVars.stress || 0) > 0.7) return true;
  if ((machineVars.context_pressure || 0) > 0.8) return true;
  return (machineVars.model_drift || 0) > 0.5;
}

async function senseTerritory(db, territoryId, options) {
  const sample = await sampleTerritory(db, territoryId, options);
  return {
    territoryId,
    variables: deriveTerritoryVariables(sample),
    measured: [...MEASURED],
    deferred: [...DEFERRED],
    sampledAt: new Date(sample.now).toISOString()
  };
}

module.exports = {
  sampleTerritory,
  deriveTerritoryVariables,
  combinePressures,
  senseTerritory,
  MEASURED,
  DEFERRED,
  DEFAULT_WINDOW_MS
};
