'use strict';

const crypto = require('node:crypto');
const daemonBridge = require('../daemon/daemonProductionBridge');

const TERMINAL_FINDINGS = ['REFUTED', 'EXPIRED', 'STALE'];
const MAX_FINDINGS = 20;
const MAX_MARKERS = 20;

const PHENOTYPE_TOPOLOGIES = Object.freeze({
  security: ['trinity', 'biocenose'],
  contract: ['trinity', 'metapopulation'],
  dependency: ['metapopulation', 'trinity'],
  documentation: ['a_team', 'trinity'],
  historian: ['metapopulation', 'syncytium'],
  chaperone: ['a_team', 'biocenose'],
  metabolic: ['biome', 'rhizome'],
  cross_repo: ['metapopulation', 'rhizome'],
  repair: ['a_team', 'trinity'],
  deep_research: ['rhizome', 'biome']
});

async function safeAll(db, query) {
  try {
    return await db.all(query.sql, query.args || []);
  } catch (_) {
    return [];
  }
}

async function safeGet(db, query) {
  try {
    return await db.get(query.sql, query.args || []);
  } catch (_) {
    return null;
  }
}

function text(value, limit) {
  return String(value || '').slice(0, limit);
}

function activePhenotypes(rows) {
  return rows.filter((row) => row.status === 'ACTIVE').map((row) => ({
    family: row.family,
    pressure: Number(row.pressure || 0),
    recommendedTopologies: PHENOTYPE_TOPOLOGIES[row.family] || []
  }));
}

function findingsAtHead(rows, headSha) {
  return rows.filter((row) => row.head_sha === headSha && !TERMINAL_FINDINGS.includes(row.status))
    .map((row) => ({
      id: row.id,
      status: row.status,
      claim: text(row.claim, 500),
      scope: { type: row.scope_type, value: text(row.scope_value, 240) },
      detectorId: row.detector_id || null,
      headSha: row.head_sha
    }));
}

function attentionMarkers(rows) {
  return rows.map((row) => ({
    scope: text(row.scope, 240),
    kind: row.kind,
    intensity: Number(row.intensity || 0)
  }));
}

function topologyRecommendations(phenotypes) {
  const ordered = phenotypes.flatMap((item) => item.recommendedTopologies);
  return [...new Set(ordered)];
}

function fingerprintPayload(snapshot) {
  return {
    territoryId: snapshot.territoryId,
    headSha: snapshot.headSha,
    indexedHeadSha: snapshot.indexedHeadSha,
    fresh: snapshot.fresh,
    territoryState: snapshot.territoryState,
    daemon: snapshot.daemon,
    activePhenotypes: snapshot.activePhenotypes,
    findings: snapshot.findings,
    attention: snapshot.attention
  };
}

function daemonState(runtime) {
  return {
    live: runtime?.live === true,
    daemonId: runtime?.daemonId || null,
    reason: runtime?.reason || null
  };
}

function fingerprintOf(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(fingerprintPayload(snapshot))).digest('hex');
}

async function readPhenotypes(db, territoryId) {
  return safeAll(db, {
    sql: `SELECT family, status, pressure FROM daemon_phenotypes
      WHERE territory_id = ? ORDER BY pressure DESC, family`,
    args: [territoryId]
  });
}

async function readFindings(db, territoryId) {
  return safeAll(db, {
    sql: `SELECT id, status, claim, scope_type, scope_value, detector_id, head_sha
      FROM daemon_findings WHERE territory_id = ?
      ORDER BY CASE status WHEN 'REPAIRABLE' THEN 6 WHEN 'CAUSALLY_SUPPORTED' THEN 5
        WHEN 'REPRODUCED' THEN 4 WHEN 'SUPPORTED' THEN 3 WHEN 'HYPOTHESIZED' THEN 2 ELSE 1 END DESC,
        updated_at DESC LIMIT ?`,
    args: [territoryId, MAX_FINDINGS]
  });
}

async function readMarkers(db, territoryId) {
  return safeAll(db, {
    sql: `SELECT scope, kind, intensity FROM daemon_stigmergy_markers
      WHERE territory_id = ? AND ABS(intensity) >= 0.05
      ORDER BY ABS(intensity) DESC LIMIT ?`,
    args: [territoryId, MAX_MARKERS]
  });
}

async function territoryRecord(db, territoryId) {
  return safeGet(db, {
    sql: `SELECT id, head_sha, indexed_head_sha, state, last_indexed_at
      FROM daemon_territories WHERE id = ?`,
    args: [territoryId]
  });
}

function unavailable(reason) {
  return {
    schema: 'genos.ontogenesis-daemon-sensory/v1',
    available: false,
    reason,
    authority: 'advisory',
    mayAuthorize: false,
    mayPromote: false
  };
}

function assembleSnapshot(input) {
  const phenotypes = activePhenotypes(input.phenotypes);
  const snapshot = {
    schema: 'genos.ontogenesis-daemon-sensory/v1',
    available: true,
    territoryId: input.territory.id,
    headSha: input.territory.head_sha,
    indexedHeadSha: input.territory.indexed_head_sha || null,
    fresh: input.territory.indexed_head_sha === input.territory.head_sha,
    territoryState: input.territory.state,
    daemon: daemonState(input.runtime),
    activePhenotypes: phenotypes,
    findings: findingsAtHead(input.findings, input.territory.head_sha),
    attention: attentionMarkers(input.markers),
    recommendedTopologies: topologyRecommendations(phenotypes),
    authority: 'advisory',
    mayAuthorize: false,
    mayPromote: false
  };
  return { ...snapshot, fingerprint: fingerprintOf(snapshot) };
}

async function observeProject(db, project) {
  if (!db || !project || !project.root_path) return unavailable('project-root-required');
  const territoryId = await daemonBridge.resolveTerritoryByRoot(db, project.root_path);
  if (!territoryId) return unavailable('no-territory-registered');
  const territory = await territoryRecord(db, territoryId);
  if (!territory) return unavailable('territory-unavailable');
  const [runtime, phenotypes, findings, markers] = await Promise.all([
    daemonBridge.daemonLive(db, territoryId),
    readPhenotypes(db, territoryId),
    readFindings(db, territoryId),
    readMarkers(db, territoryId)
  ]);
  return assembleSnapshot({ territory, runtime, phenotypes, findings, markers });
}

function actionable(snapshot) {
  return snapshot.available === true && snapshot.fresh === true && (snapshot.activePhenotypes.length > 0
    || snapshot.findings.length > 0 || snapshot.attention.length > 0);
}

function eventId(input) {
  const digest = crypto.createHash('sha256')
    .update(`${input.projectId}\0${input.snapshot.fingerprint}`).digest('hex').slice(0, 32);
  return `sensory_${digest}`;
}

async function publishObservation(db, input) {
  if (!actionable(input.snapshot)) return { published: false, reason: 'no-actionable-signal' };
  const id = eventId(input);
  const payload = {
    source: 'resident_daemon',
    sensoryFingerprint: input.snapshot.fingerprint,
    territoryId: input.snapshot.territoryId,
    headSha: input.snapshot.headSha,
    activePhenotypes: input.snapshot.activePhenotypes.map((item) => item.family),
    findingIds: input.snapshot.findings.map((item) => item.id),
    authority: 'advisory'
  };
  const result = await db.run(
    `INSERT OR IGNORE INTO ontogenesis_events (id, project_id, type, payload_json)
     VALUES (?, ?, 'wake', ?)`,
    [id, input.projectId, JSON.stringify(payload)]
  );
  return { published: result.changes === 1, eventId: id, fingerprint: input.snapshot.fingerprint };
}

function summarize(snapshot) {
  if (!snapshot?.available) return { available: false, reason: snapshot?.reason || 'unavailable' };
  return {
    available: true,
    territoryId: snapshot.territoryId,
    headSha: snapshot.headSha,
    fresh: snapshot.fresh,
    daemonLive: snapshot.daemon?.live === true,
    daemonHealthReason: snapshot.daemon?.reason || null,
    activePhenotypes: snapshot.activePhenotypes.map((item) => item.family),
    findings: snapshot.findings.length,
    attentionMarkers: snapshot.attention.length,
    authority: snapshot.authority
  };
}

module.exports = {
  PHENOTYPE_TOPOLOGIES,
  observeProject,
  publishObservation,
  summarize
};
