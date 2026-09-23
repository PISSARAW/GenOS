'use strict';

/**
 * Ecological Specialization — ADR 0034 D16 v1.
 *
 * Pas de daemons prédéfinis : un phénotype émerge (budding) quand la
 * pression écologique mesurée dépasse le seuil, redevient DORMANT
 * quand elle retombe, n'est jamais supprimé (réversibilité).
 *
 * Familles v1 (4/10 de l'ADR — Security, Contract, Dependency,
 * Documentation ; Historian, Chaperone, Metabolic, CrossRepo Symbiont,
 * Repair, DeepResearch différés, faute de signaux mesurés) :
 *  - security     : HIGH_RISK stigmergique + test_failure_pressure
 *  - contract     : CONTRACT_DRIFT + findings broken-import
 *  - dependency   : findings broken-import + change_rate
 *  - documentation: findings missing-sibling-test + knowledge_staleness
 *
 * Tout est mesuré (interoception, findings, stigmergie), jamais
 * inventé par LLM. Seuils : ACTIVE ≥ 0.6, DORMANT ≤ 0.3, entre les
 * deux le statut courant est conservé (hystérésis anti-battement).
 */

const { migrateDaemonPhenotype } = require('../../../db/migrations/migrateDaemonPhenotype');
const { migrateDaemonStigmergy } = require('../../../db/migrations/migrateDaemonStigmergy');
const interoception = require('../daemonTerritoryInteroceptionService');
const findingService = require('../findings/findingService');

const FAMILIES = ['security', 'contract', 'dependency', 'documentation'];
const ACTIVATE_AT = 0.6;
const DORMANT_AT = 0.3;

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function countByDetector(findings, detectorId) {
  return (findings || []).filter((f) => f.detectorId === detectorId || f.detector_id === detectorId).length;
}

async function markerIntensity(db, territoryId, kind) {
  const row = await db.get(
    'SELECT intensity FROM daemon_stigmergy_markers WHERE territory_id = ? AND kind = ? ORDER BY ABS(intensity) DESC LIMIT 1',
    territoryId,
    kind
  );
  return clamp01(Math.abs(Number((row && row.intensity) || 0)) / 10);
}

async function measureEcologicalPressure(db, args) {
  if (!db || !args || !args.territoryId) return { measured: false };
  await migrateDaemonPhenotype(db);
  await migrateDaemonStigmergy(db);
  const sensed = await interoception.senseTerritory(db, args.territoryId, { now: args.now });
  const findings = await findingService.listFindings(db, { territoryId: args.territoryId });
  const live = findings.filter((f) => f.status !== 'REFUTED' && f.status !== 'EXPIRED');
  const vars = sensed.variables || {};
  const pressures = await derivePressures(db, { vars, live, territoryId: args.territoryId });
  return {
    measured: true,
    territoryId: args.territoryId,
    pressures
  };
}

async function derivePressures(db, job) {
  const { vars, live, territoryId } = job;
  return {
    security: clamp01(Math.max(
      vars.test_failure_pressure || 0,
      await markerIntensity(db, territoryId, 'HIGH_RISK')
    )),
    contract: clamp01(Math.max(
      await markerIntensity(db, territoryId, 'CONTRACT_DRIFT'),
      countByDetector(live, 'broken-import') / 3
    )),
    dependency: clamp01(Math.max(
      countByDetector(live, 'broken-import') / 3,
      0.5 * (vars.change_rate || 0)
    )),
    documentation: clamp01(Math.max(
      countByDetector(live, 'missing-sibling-test') / 3,
      0.5 * (vars.knowledge_staleness || 0)
    ))
  };
}

function nextStatus(current, pressure) {
  if (pressure >= ACTIVATE_AT) return 'ACTIVE';
  if (pressure <= DORMANT_AT) return 'DORMANT';
  return current || 'DORMANT';
}

async function assignPhenotypes(db, args) {
  const measured = await measureEcologicalPressure(db, args);
  if (!measured.measured) return { assigned: false };
  const out = [];
  for (const family of FAMILIES) {
    out.push(await assignFamily(db, { territoryId: args.territoryId, family, pressure: measured.pressures[family] || 0 }));
  }
  return { assigned: true, territoryId: args.territoryId, phenotypes: out };
}

async function assignFamily(db, job) {
  const row = await db.get(
    'SELECT status, budded_at FROM daemon_phenotypes WHERE territory_id = ? AND family = ?',
    job.territoryId,
    job.family
  );
  const status = nextStatus(row && row.status, job.pressure);
  const budded = (row && row.buddedAt) || (row && row.budded_at) || null;
  await db.run(
    `INSERT INTO daemon_phenotypes (territory_id, family, status, pressure, budded_at, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(territory_id, family) DO UPDATE SET
       status = excluded.status, pressure = excluded.pressure,
       budded_at = COALESCE(daemon_phenotypes.budded_at, excluded.budded_at),
       updated_at = datetime('now')`,
    job.territoryId,
    job.family,
    status,
    job.pressure,
    status === 'ACTIVE' ? new Date().toISOString() : budded
  );
  return { family: job.family, status, pressure: job.pressure, budded: status === 'ACTIVE' };
}

async function getPhenotypes(db, query) {
  if (!db || !query || !query.territoryId) return [];
  await migrateDaemonPhenotype(db);
  return db.all('SELECT * FROM daemon_phenotypes WHERE territory_id = ? ORDER BY family', query.territoryId);
}

module.exports = {
  FAMILIES,
  ACTIVATE_AT,
  DORMANT_AT,
  measureEcologicalPressure,
  assignPhenotypes,
  getPhenotypes
};
