'use strict';

/**
 * Handoff Compiler — ADR 0034 D11.
 *
 * Sur ORCHESTRATOR_ENTERED, compile un TerritoryBrief orienté
 * mission depuis l'état territorial (graphe, findings, stigmergie)
 * et le persiste. Retourne le brief + le signal zero-text
 * TERRITORY_BRIEF_READY à publier sur le Signal Plane.
 * Le brief complet n'est récupéré que sur demande explicite.
 */

const crypto = require('node:crypto');
const { migrateDaemonHandoffs } = require('../../../db/migrations/migrateDaemonHandoffs');
const territoryService = require('../daemonTerritoryService');
const findingService = require('../findings/findingService');
const graphStore = require('../cartography/graphStore');
const stigmergyService = require('../daemonStigmergyService');
const relevance = require('./handoffRelevanceService');

const MAX_BRIEF_FINDINGS = 20;
const MAX_DEAD_ENDS = 10;
const MAX_TESTS = 50;

function briefIdFor(territoryId, headSha, mission) {
  const hash = crypto.createHash('sha256').update(`${territoryId}|${headSha}|${mission || ''}|${Date.now()}`).digest('hex').slice(0, 12);
  return `brief-${hash}`;
}

async function openFindings(db, territoryId) {
  const rows = await db.all(
    `SELECT f.*,
       (SELECT COUNT(*) FROM daemon_finding_evidence e WHERE e.finding_id = f.id AND e.side = 'supporting') AS supporting,
       (SELECT COUNT(*) FROM daemon_finding_evidence e WHERE e.finding_id = f.id AND e.side = 'contradicting') AS contradicting
     FROM daemon_findings f
     WHERE f.territory_id = ? AND f.status NOT IN ('REFUTED', 'EXPIRED')
     ORDER BY f.updated_at DESC`,
    territoryId
  );
  return rows || [];
}

async function deadEnds(db, territoryId) {
  const rows = await db.all(
    `SELECT id, claim, scope_type, scope_value, updated_at FROM daemon_findings
     WHERE territory_id = ? AND status = 'REFUTED'
     ORDER BY updated_at DESC LIMIT ${MAX_DEAD_ENDS}`,
    territoryId
  );
  return rows || [];
}

async function testPaths(db, territoryId) {
  const nodes = await graphStore.listNodes(db, { territoryId });
  return (nodes || []).filter((n) => n.kind === 'test').map((n) => n.path).slice(0, MAX_TESTS);
}

async function graphSummary(db, territoryId) {
  const counts = await graphStore.countGraph(db, { territoryId });
  const nodes = await graphStore.listNodes(db, { territoryId });
  const symbols = (nodes || []).filter((n) => n.kind === 'symbol').length;
  return { files: counts.nodes - symbols, symbols, edges: counts.edges };
}

function stalenessWarnings(territory, findings) {
  const warnings = [];
  if (territory.state === 'STALE') warnings.push('territory head advanced since last survey — brief may be partial');
  for (const finding of findings || []) {
    if (finding.status === 'STALE') warnings.push(`finding ${finding.id} is stale (head ${finding.head_sha.slice(0, 8)})`);
  }
  return warnings;
}

function toBriefFinding(ranked) {
  return {
    id: ranked.finding.id,
    claim: ranked.finding.claim,
    status: ranked.finding.status,
    scope: { type: ranked.finding.scope_type, value: ranked.finding.scope_value },
    score: ranked.score,
    supporting: ranked.finding.supporting,
    contradicting: ranked.finding.contradicting,
    limitations: JSON.parse(ranked.finding.limitations_json || '[]')
  };
}

async function compileBrief(db, args) {
  if (!db || !args || !args.territoryId) return { compiled: false, reason: 'args-required' };
  await migrateDaemonHandoffs(db);
  const stored = await territoryService.getTerritory(db, { id: args.territoryId });
  if (!stored.found) return { compiled: false, reason: 'unknown-territory' };
  const territory = stored.territory;
  const findings = await openFindings(db, args.territoryId);
  const ranked = relevance.rankFindings(findings, { mission: args.mission });
  const brief = await buildBrief(db, { args, territory, ranked });
  await db.run(
    `INSERT INTO daemon_handoffs (id, territory_id, head_sha, mission, relevance_class, brief_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    brief.briefId,
    args.territoryId,
    territory.headSha,
    args.mission || null,
    brief.relevanceClass,
    JSON.stringify(brief)
  );
  return { compiled: true, brief, signal: toReadySignal(brief) };
}

async function buildBrief(db, job) {
  const { args, territory, ranked } = job;
  const top = ranked.slice(0, MAX_BRIEF_FINDINGS);
  const briefId = briefIdFor(args.territoryId, territory.headSha, args.mission);
  const attention = await stigmergyService.readAttention(db, { territoryId: args.territoryId, limit: 5 });
  return {
    briefId,
    territoryId: args.territoryId,
    headSha: territory.headSha,
    mission: args.mission || null,
    relevanceClass: relevance.relevanceClass(ranked),
    summary: {
      ...(await graphSummary(db, args.territoryId)),
      openFindings: ranked.length,
      deadEnds: (await deadEnds(db, args.territoryId)).length
    },
    findings: top.map(toBriefFinding),
    deadEnds: await deadEnds(db, args.territoryId),
    tests: await testPaths(db, args.territoryId),
    attention,
    stalenessWarnings: stalenessWarnings(territory, ranked.map((r) => r.finding)),
    generatedAt: new Date().toISOString()
  };
}

function toReadySignal(brief) {
  return {
    semanticType: 'TERRITORY_BRIEF_READY',
    briefId: brief.briefId,
    territoryId: brief.territoryId,
    headSha: brief.headSha,
    relevanceClass: brief.relevanceClass
  };
}

async function getBrief(db, query) {
  if (!db || !query || !query.briefId) return { found: false };
  await migrateDaemonHandoffs(db);
  const row = await db.get('SELECT * FROM daemon_handoffs WHERE id = ?', query.briefId);
  if (!row) return { found: false };
  return { found: true, brief: JSON.parse(row.brief_json || '{}'), status: row.status };
}

module.exports = { compileBrief, getBrief, toReadySignal };
