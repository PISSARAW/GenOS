'use strict';

const detectorRegistry = require('../investigation/anomalyDetectorRegistry');
const ecological = require('../investigation/ecologicalDetectors');
const events = require('../daemonEventLog');
const findingService = require('../findings/findingService');
const evidence = require('../findings/findingEvidenceService');
const receipts = require('./observationReceiptService');

const FILE_RULES = new Set(['secret-exposure', 'unintegrated-component', 'stale-documentation']);
const EVENT_RULES = new Set(['repeated-failure', 'resource-anomaly', 'contract-drift', 'cross-repo-drift', 'knowledge-gap']);

async function verify(db, ctx) {
  const id = ctx.finding.detectorId;
  const recent = await events.listRecentEvents(db, { territoryId: ctx.finding.territoryId, windowMs: 86400000 });
  const context = { territoryId: ctx.finding.territoryId, headSha: ctx.territory.headSha,
    rootPath: ctx.territory.rootPath, files: [ctx.finding.scope.value], events: recent };
  if (FILE_RULES.has(id) && !receipts.sourceHash(ctx.territory, ctx.finding.scope)) return { name: 'source-unavailable', transition: null };
  const detector = [...detectorRegistry.defaultDetectors(), ...ecological.detectors()].find((row) => row.id === id);
  const remaining = detector.detect(context).filter((row) => row.claim === ctx.finding.claim);
  if (!remaining.length && EVENT_RULES.has(id)) return { name: 'observation-window-ended', transition: null };
  const supporting = remaining.length > 0;
  const provenanceRecordId = await receipts.record(db, { findingId: ctx.finding.id,
    territoryId: ctx.finding.territoryId, headSha: ctx.territory.headSha, detectorId: id,
    sourceHash: receipts.sourceHash(ctx.territory, ctx.finding.scope),
    eventIds: recent.map((row) => row.id), matches: remaining.length });
  await evidence.appendEvidence(db, { findingId: ctx.finding.id, side: supporting ? 'supporting' : 'contradicting',
    evidenceType: 'observational', description: supporting ? 'Detector observation independently rechecked' : 'Detector observation no longer present', provenanceRecordId });
  if (supporting) return { name: 'candidate-rechecked', transition: null };
  const moved = await findingService.transitionFinding(db, { id: ctx.finding.id, toStatus: 'REFUTED' });
  return { name: 'candidate-refuted', transition: moved.finding?.status === 'REFUTED' ? 'REFUTED' : null };
}

module.exports = { verify, ids: [...FILE_RULES, ...EVENT_RULES] };
