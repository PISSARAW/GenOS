'use strict';

/**
 * Verifier — système immunitaire épistémique (ADR 0034 D9 v1).
 *
 * Vérification structurelle, déterministe, sans LLM :
 *  1. HEAD bougé → STALE (revalidation requise, jamais transport) ;
 *  2. scope disparu du graphe → EXPIRED (plus d'objet à l'allégation) ;
 *  3. règles par détecteur : récupération post-échec → REFUTED,
 *     répétition indépendante → SUPPORTED, test apparu → REFUTED.
 * Chaque transition s'accompagne d'une preuve typée annexée.
 * REFUTED/EXPIRED ne sont jamais rouverts ici.
 */

const territoryService = require('../daemonTerritoryService');
const findingService = require('../findings/findingService');
const evidenceService = require('../findings/findingEvidenceService');
const lifecycle = require('../findings/findingLifecycleService');
const graphStore = require('../cartography/graphStore');
const eventLog = require('../daemonEventLog');
const reproduction = require('./reproductionService');

async function verifyFinding(db, args) {
  if (!db || !args || !args.findingId) return { verified: false, reason: 'args-required' };
  const stored = await findingService.getFinding(db, { id: args.findingId });
  if (!stored.found) return { verified: false, reason: 'not-found' };
  if (lifecycle.isTerminal(stored.finding.status)) return { verified: false, reason: 'terminal', status: stored.finding.status };
  const territory = await territoryService.getTerritory(db, { id: stored.finding.territoryId });
  if (!territory.found) return { verified: false, reason: 'unknown-territory' };
  const checks = [];
  const headCheck = await checkHeadFreshness(db, { finding: stored.finding, territory: territory.territory, daemonId: args.daemonId });
  checks.push(headCheck.name);
  if (headCheck.transition) return { verified: true, findingId: args.findingId, checks, transition: headCheck.transition };
  const scopeCheck = await checkScopeExists(db, { finding: stored.finding, daemonId: args.daemonId });
  checks.push(scopeCheck.name);
  if (scopeCheck.transition) return { verified: true, findingId: args.findingId, checks, transition: scopeCheck.transition };
  const rule = await applyDetectorRule(db, { finding: stored.finding, territory: territory.territory, daemonId: args.daemonId });
  checks.push(rule.name);
  return { verified: true, findingId: args.findingId, checks, transition: rule.transition };
}

async function checkHeadFreshness(db, ctx) {
  if (ctx.territory.headSha === ctx.finding.headSha) return { name: 'head-fresh', transition: null };
  await appendDraft(db, ctx, {
    side: 'supporting',
    evidenceType: 'observational',
    description: `territory head advanced from ${ctx.finding.headSha.slice(0, 8)} — knowledge requires revalidation`,
    provenanceRecordId: `daemon-territory:${ctx.finding.territoryId}`
  });
  await findingService.markStaleOnHead(db, { territoryId: ctx.finding.territoryId, headSha: ctx.territory.headSha });
  return { name: 'head-moved', transition: 'STALE' };
}

async function checkScopeExists(db, ctx) {
  const scope = ctx.finding.scope || {};
  if (scope.type !== 'file' && scope.type !== 'test') return { name: 'scope-nonlocal', transition: null };
  const nodes = await graphStore.listNodes(db, { territoryId: ctx.finding.territoryId, path: scope.value });
  if ((nodes || []).length > 0) return { name: 'scope-present', transition: null };
  await appendDraft(db, ctx, {
    side: 'contradicting',
    evidenceType: 'observational',
    description: `scope ${scope.value} vanished from territorial graph — claim has no object`,
    provenanceRecordId: `daemon-graph:${ctx.finding.territoryId}`
  });
  await findingService.transitionFinding(db, { id: ctx.finding.id, toStatus: 'EXPIRED' });
  return { name: 'scope-vanished', transition: 'EXPIRED' };
}

async function appendDraft(db, ctx, draft) {
  await evidenceService.appendEvidence(db, {
    findingId: ctx.finding.id,
    side: draft.side,
    evidenceType: draft.evidenceType,
    description: draft.description,
    provenanceRecordId: draft.provenanceRecordId,
    metadata: draft.metadata || {}
  });
}

async function applyDetectorRule(db, ctx) {
  const rule = RULES[ctx.finding.detectorId] || ruleNoop;
  return rule(db, ctx);
}

async function ruleNoop(db, ctx) {
  return { name: `no-rule:${ctx.finding.detectorId || 'unknown'}`, transition: null };
}

async function ruleTestRegression(db, ctx) {
  const recoveries = await scopedEvents(db, ctx, ['TEST_RECOVERED']);
  if (recoveries.length > 0) {
    await appendDraft(db, ctx, {
      side: 'contradicting',
      evidenceType: 'observational',
      description: `scope ${ctx.finding.scope.value} recovered after finding creation — deterministic-failure claim falsified`,
      provenanceRecordId: `daemon-event:${recoveries[0].id}`
    });
    await findingService.transitionFinding(db, { id: ctx.finding.id, toStatus: 'REFUTED' });
    return { name: 'recovered-after-claim', transition: 'REFUTED' };
  }
  const replay = await reproduction.reproduceFinding(db, { finding: ctx.finding });
  if (!replay.reproduced) return { name: 'no-independent-repeat', transition: null };
  await appendDraft(db, ctx, replay.evidenceDraft);
  const ready = await ensureHypothesized(db, ctx.finding);
  await findingService.transitionFinding(db, { id: ready.id, toStatus: 'SUPPORTED' });
  return { name: 'independently-repeated', transition: 'SUPPORTED' };
}

async function ruleFlakySignal(db, ctx) {
  const cycles = await scopedEvents(db, ctx, ['TEST_FAILED', 'TEST_RECOVERED']);
  if (cycles.length === 0) return { name: 'no-new-instability', transition: null };
  await appendDraft(db, ctx, {
    side: 'supporting',
    evidenceType: 'replicated',
    description: `scope ${ctx.finding.scope.value} showed ${cycles.length} further unstable outcome(s) — flakiness confirmed again`,
    provenanceRecordId: `daemon-event:${cycles[0].id}`
  });
  const ready = await ensureHypothesized(db, ctx.finding);
  await findingService.transitionFinding(db, { id: ready.id, toStatus: 'SUPPORTED' });
  return { name: 'instability-confirmed', transition: 'SUPPORTED' };
}

async function ruleBrokenImport(db, ctx) {
  const detectorRegistry = require('../investigation/anomalyDetectorRegistry');
  const builtin = detectorRegistry.defaultDetectors().find((d) => d.id === 'broken-import');
  const context = { territoryId: ctx.finding.territoryId, headSha: ctx.finding.headSha, rootPath: ctx.territory.rootPath, files: [ctx.finding.scope.value], events: [] };
  const remaining = builtin.detect(context);
  if (remaining.length > 0) {
    await appendDraft(db, ctx, {
      side: 'supporting',
      evidenceType: 'replicated',
      description: `import still unresolvable in ${ctx.finding.scope.value} — observation replicated`,
      provenanceRecordId: `daemon-fs:${ctx.finding.scope.value}`
    });
    const ready = await ensureHypothesized(db, ctx.finding);
    await findingService.transitionFinding(db, { id: ready.id, toStatus: 'SUPPORTED' });
    return { name: 'still-broken', transition: 'SUPPORTED' };
  }
  await appendDraft(db, ctx, {
    side: 'contradicting',
    evidenceType: 'observational',
    description: `all imports in ${ctx.finding.scope.value} resolve now — claim falsified`,
    provenanceRecordId: `daemon-fs:${ctx.finding.scope.value}`
  });
  await findingService.transitionFinding(db, { id: ctx.finding.id, toStatus: 'REFUTED' });
  return { name: 'imports-resolve-now', transition: 'REFUTED' };
}

async function ruleMissingSiblingTest(db, ctx) {
  const detectorRegistry = require('../investigation/anomalyDetectorRegistry');
  const builtin = detectorRegistry.defaultDetectors().find((d) => d.id === 'missing-sibling-test');
  const context = { territoryId: ctx.finding.territoryId, headSha: ctx.finding.headSha, rootPath: ctx.territory.rootPath, files: [ctx.finding.scope.value], events: [] };
  const remaining = builtin.detect(context);
  if (remaining.length > 0) return { name: 'still-untested', transition: null };
  await appendDraft(db, ctx, {
    side: 'contradicting',
    evidenceType: 'observational',
    description: `a covering test exists now for ${ctx.finding.scope.value} — claim falsified`,
    provenanceRecordId: `daemon-fs:${ctx.finding.scope.value}`
  });
  await findingService.transitionFinding(db, { id: ctx.finding.id, toStatus: 'REFUTED' });
  return { name: 'test-appeared', transition: 'REFUTED' };
}

async function scopedEvents(db, ctx, types) {
  const createdAt = Date.parse(ctx.finding.createdAt || '') || 0;
  const events = await eventLog.listRecentEvents(db, {
    territoryId: ctx.finding.territoryId,
    windowMs: Math.max(60000, Date.now() - createdAt + 60000),
    types
  });
  return events.filter((event) => {
    if ((Date.parse(event.created_at || '') || 0) <= createdAt) return false;
    const payload = eventLog.parsePayload(event);
    return payload.file === ctx.finding.scope.value || payload.scope === ctx.finding.scope.value;
  });
}

async function ensureHypothesized(db, finding) {
  if (finding.status !== 'OBSERVED') return finding;
  const moved = await findingService.transitionFinding(db, { id: finding.id, toStatus: 'HYPOTHESIZED' });
  return (moved && moved.finding) || finding;
}

const RULES = {
  'test-regression': ruleTestRegression,
  'flaky-signal': ruleFlakySignal,
  'broken-import': ruleBrokenImport,
  'missing-sibling-test': ruleMissingSiblingTest
};

module.exports = { verifyFinding };
