'use strict';

/**
 * Ecological Specialization — ADR 0034 D16 v2.
 *
 * Un seul archétype biologique (ResidentDaemon) + organes internes
 * (Cartographer, Investigator, Verifier, Reconciler, Handoff) +
 * phénotypes écologiques qui émergent selon la pression du territoire.
 * Jamais une liste de daemons spécialisés lancés au démarrage.
 *
 * Familles (10/10) : security, contract, dependency, documentation
 * (v1) + historian, chaperone, metabolic, cross_repo, repair,
 * deep_research (v2 — signaux tous mesurés, jamais inventés).
 *
 * Seuils : ACTIVE ≥ 0.6, DORMANT ≤ 0.3, hystérésis entre les deux.
 * Le daemon observe et connaît. L'orchestrator décide. Le worker
 * intervient (RepairEpisode = lease bornée, jamais patch direct).
 */

const { migrateDaemonPhenotype } = require('../../../db/migrations/migrateDaemonPhenotype');
const { migrateDaemonStigmergy } = require('../../../db/migrations/migrateDaemonStigmergy');
const interoception = require('../daemonTerritoryInteroceptionService');
const findingService = require('../findings/findingService');
const repairService = require('../repair/repairEpisodeService');

const FAMILIES = [
  'security',
  'contract',
  'dependency',
  'documentation',
  'historian',
  'chaperone',
  'metabolic',
  'cross_repo',
  'repair',
  'deep_research'
];

const ACTIVATE_AT = 0.6;
const DORMANT_AT = 0.3;
const LEGACY_FAMILIES = ['security', 'contract', 'dependency', 'documentation'];

/**
 * Modulation organique par phénotype (§24 du modèle) : chaque
 * phénotype ne change qu'attention, capteurs, détecteurs, mémoire
 * et rang handoff — jamais l'identité du daemon.
 */
const PHENOTYPE_PROFILES = {
  security: { organs: ['cartographer.security-graph', 'investigator.security-detectors', 'verifier.security-repro', 'handoff.security-brief'], memory: 'threat-signature' },
  contract: { organs: ['cartographer.producer-contract-consumer', 'investigator.contract-detectors', 'verifier.consumer-replay', 'handoff.contract-brief'], memory: 'contract-evolution' },
  dependency: { organs: ['cartographer.dependents-graph', 'investigator.churn-detectors', 'verifier.compatibility-repro', 'handoff.dependency-brief'], memory: 'compatibility-history' },
  documentation: { organs: ['cartographer.code-doc-edges', 'investigator.drift-detectors', 'verifier.example-repro', 'handoff.doc-drift-brief'], memory: 'code-doc-evolution' },
  historian: { organs: ['cartographer.temporal-graph', 'investigator.similarity-search', 'verifier.commit-replay', 'handoff.causal-history-brief'], memory: 'deep-temporal' },
  chaperone: { organs: ['cartographer.integration-edges', 'investigator.folding-detectors', 'verifier.registration-check', 'handoff.integration-brief'], memory: 'recent-structures' },
  metabolic: { organs: ['cartographer.resource-flow', 'investigator.resource-anomalies', 'verifier.measured-repro', 'handoff.resource-brief'], memory: 'resource-history' },
  cross_repo: { organs: ['cartographer.cross-territory-edges', 'investigator.divergence-detectors', 'verifier.cross-replay', 'handoff.symbiont-brief'], memory: 'shared-schema-history' },
  repair: { organs: ['cartographer.opportunity-map', 'investigator.readiness-check', 'verifier.outcome-monitor', 'handoff.repair-brief'], memory: 'repair-outcomes' },
  deep_research: { organs: ['cartographer.knowledge-gaps', 'investigator.deficit-detectors', 'verifier.source-triangulation', 'handoff.research-brief'], memory: 'external-sources' }
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function countByDetector(findings, detectorId) {
  return (findings || []).filter((f) => f.detectorId === detectorId || f.detector_id === detectorId).length;
}

function countByStatus(findings, status) {
  return (findings || []).filter((f) => f.status === status).length;
}

async function markerIntensity(db, territoryId, kind) {
  const row = await db.get(
    'SELECT intensity FROM daemon_stigmergy_markers WHERE territory_id = ? AND kind = ? ORDER BY ABS(intensity) DESC LIMIT 1',
    territoryId,
    kind
  );
  return clamp01(Math.abs(Number((row && row.intensity) || 0)) / 10);
}

async function eventPressure(db, query) {
  try {
    const row = await db.get(
      'SELECT COUNT(*) as n FROM daemon_events WHERE territory_id = ? AND event_type = ?',
      query.territoryId,
      query.type
    );
    return clamp01(Number((row && row.n) || 0) / (query.divisor || 5));
  } catch (_) {
    return 0;
  }
}

async function measureEcologicalPressure(db, args) {
  if (!db || !args || !args.territoryId) return { measured: false };
  await migrateDaemonPhenotype(db);
  await migrateDaemonStigmergy(db);
  const sensed = await interoception.senseTerritory(db, args.territoryId, { now: args.now });
  const findings = await findingService.listFindings(db, { territoryId: args.territoryId });
  const live = findings.filter((f) => f.status !== 'REFUTED' && f.status !== 'EXPIRED');
  const vars = sensed.variables || {};
  const pressures = await derivePressures(db, { vars, live, all: findings, territoryId: args.territoryId });
  return {
    measured: true,
    territoryId: args.territoryId,
    pressures
  };
}

async function derivePressures(db, job) {
  const base = await deriveLegacyPressures(db, job);
  const extended = await deriveEmergentPressures(db, job);
  return { ...base, ...extended };
}

async function deriveLegacyPressures(db, job) {
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

async function deriveEmergentPressures(db, job) {
  return {
    historian: await historianPressure(db, job),
    chaperone: await chaperonePressure(db, job),
    metabolic: metabolicPressure(job),
    cross_repo: await crossRepoPressure(db, job),
    repair: await repairPressure(db, job),
    deep_research: await deepResearchPressure(db, job)
  };
}

/** Historian : échecs répétés + réfutations + churn historique. */
async function historianPressure(db, job) {
  const { live, all, vars, territoryId } = job;
  const repeated = (countByDetector(live, 'flaky-signal') + countByDetector(live, 'test-regression') + countByDetector(live, 'repeated-failure')) / 4;
  const refuted = countByStatus(all, 'REFUTED') / 5;
  const churn = 0.5 * (vars.change_rate || 0);
  const sensed = Math.max(vars.repeated_failure_pressure || 0, await eventPressure(db, { territoryId, type: 'FINDING_REFUTED', divisor: 5 }));
  return clamp01(Math.max(repeated, refuted, churn, sensed));
}

/** Chaperone : structures neuves mal intégrées (sans test, churn récent). */
async function chaperonePressure(db, job) {
  const { live, vars, territoryId } = job;
  const unintegrated = Math.max(
    countByDetector(live, 'missing-sibling-test') / 2,
    countByDetector(live, 'unintegrated-component')
  );
  const churn = vars.change_rate || 0;
  const sensed = Math.max(vars.integration_pressure || 0, await eventPressure(db, { territoryId, type: 'AGENT_FAILED', divisor: 3 }));
  return clamp01(Math.max(unintegrated, 0.6 * churn, sensed));
}

/** Metabolic : pression ressources mesurée (build, orphelins, churn). */
function metabolicPressure(job) {
  const vars = job.vars || {};
  return clamp01(Math.max(
    vars.build_failure_pressure || 0,
    vars.orphan_pressure || 0,
    0.5 * (vars.change_rate || 0)
  ));
}

/** CrossRepo Symbiont : dérive de contrats partagés entre territoires. */
async function crossRepoPressure(db, job) {
  const { live, territoryId } = job;
  const drift = await markerIntensity(db, territoryId, 'CONTRACT_DRIFT');
  const broken = countByDetector(live, 'broken-import') / 2;
  const perf = await markerIntensity(db, territoryId, 'PERFORMANCE_REGRESSION');
  return clamp01(Math.max(drift, broken, 0.5 * perf));
}

/**
 * Repair phenotype : opportunité + backlog, jamais patch direct.
 * Le daemon prépare l'épisode ; le worker répare sous lease.
 */
async function repairPressure(db, job) {
  const { live, vars, territoryId } = job;
  const repairable = countByStatus(live, 'REPAIRABLE') / 2;
  const episodes = await openRepairPressure(db, territoryId);
  const backlog = Math.max(vars.repair_backlog_pressure || 0, countByDetector(live, 'test-regression') / 5);
  return clamp01(Math.max(repairable, episodes, backlog));
}

async function openRepairPressure(db, territoryId) {
  try {
    const open = await repairService.listEpisodes(db, { territoryId, status: 'OPEN' });
    const claimed = await repairService.listEpisodes(db, { territoryId, status: 'CLAIMED' });
    return clamp01(((open || []).length + (claimed || []).length) / 3);
  } catch (_) {
    return 0;
  }
}

/** DeepResearch : déficit de connaissance locale (staleness + dead ends). */
async function deepResearchPressure(db, job) {
  const { live, vars, territoryId } = job;
  const staleness = Math.max(vars.knowledge_staleness || 0, vars.knowledge_gap_pressure || 0);
  const deadEnd = await markerIntensity(db, territoryId, 'DEAD_END');
  const staleEvents = await eventPressure(db, { territoryId, type: 'KNOWLEDGE_STALE', divisor: 3 });
  const docDrift = countByDetector(live, 'stale-documentation') / 3;
  return clamp01(Math.max(0.6 * staleness, deadEnd, staleEvents, docDrift));
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

async function getActivePhenotypes(db, query) {
  const rows = await getPhenotypes(db, query);
  return (rows || []).filter((r) => r.status === 'ACTIVE').map((r) => r.family);
}

function describePhenotype(family) {
  const profile = PHENOTYPE_PROFILES[family];
  if (!profile) return { known: false, family };
  return { known: true, family, organs: [...profile.organs], memory: profile.memory };
}

module.exports = {
  FAMILIES,
  LEGACY_FAMILIES,
  ACTIVATE_AT,
  DORMANT_AT,
  PHENOTYPE_PROFILES,
  measureEcologicalPressure,
  assignPhenotypes,
  getPhenotypes,
  getActivePhenotypes,
  describePhenotype
};
