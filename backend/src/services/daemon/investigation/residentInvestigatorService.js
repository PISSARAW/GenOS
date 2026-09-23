'use strict';

/**
 * Resident Investigator — ADR 0034 D8.
 *
 * La détection part des signaux (events + fichiers changés), pas
 * du dernier fichier modifié au mtime. Par observation :
 *   1. propose une hypothèse au ledger Natural Search (D7) ;
 *   2. crée un finding (HYPOTHESIZED si hypothèse, OBSERVED sinon).
 * L'id du finding dérive de observationHash → une même
 * observation ne crée jamais deux preuves (ON CONFLICT DO NOTHING).
 */

const territoryService = require('../daemonTerritoryService');
const eventLog = require('../daemonEventLog');
const detectorRegistry = require('./anomalyDetectorRegistry');
const nsAdapter = require('../daemonNaturalSearchAdapter');
const findingService = require('../findings/findingService');

const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

function filesFromEvents(events) {
  const files = new Set();
  for (const event of events || []) {
    if (event.event_type !== 'TERRITORY_FILE_CHANGED' && event.event_type !== 'TERRITORY_COMMIT') continue;
    const payload = eventLog.parsePayload(event);
    if (payload.file) files.add(payload.file);
    for (const file of payload.files || []) files.add(file);
  }
  return [...files];
}

async function buildContext(db, args, territory) {
  const events = await eventLog.listRecentEvents(db, {
    territoryId: args.territoryId,
    windowMs: args.windowMs || DEFAULT_WINDOW_MS
  });
  return {
    territoryId: args.territoryId,
    headSha: territory.headSha,
    rootPath: args.rootPath,
    files: args.files || filesFromEvents(events),
    events
  };
}

async function recordObservation(db, args, observation) {
  const proposal = args.ledger ? nsAdapter.proposeFromObservation(args.ledger, withDaemonId(args, observation)) : { proposed: false };
  const findingId = `finding.obs-${nsAdapter.observationHash(observation)}`;
  const created = await findingService.createFinding(db, {
    id: findingId,
    territoryId: observation.territoryId,
    claim: observation.claim,
    scope: observation.scope,
    headSha: observation.headSha,
    status: proposal.proposed ? 'HYPOTHESIZED' : 'OBSERVED',
    hypothesisId: proposal.proposed ? toHypothesisId(proposal.hypothesisId) : null,
    createdBy: args.daemonId || 'daemon.resident',
    limitations: ['detector observation, not independently verified']
  });
  return { observation, proposal, finding: created.found ? created.finding : null };
}

function withDaemonId(args, observation) {
  return { daemonId: args.daemonId || 'daemon.resident', ...observation };
}

function toHypothesisId(rawId) {
  return `hypothesis.${String(rawId || '').replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 32) || 'unknown'}`;
}

async function investigate(db, args) {
  if (!db || !args || !args.territoryId || !args.rootPath) return { investigated: false, reason: 'args-required' };
  const stored = await territoryService.getTerritory(db, { id: args.territoryId });
  if (!stored.found) return { investigated: false, reason: 'unknown-territory' };
  const context = await buildContext(db, args, stored.territory);
  const detectors = args.detectors || detectorRegistry.defaultDetectors();
  const observations = detectorRegistry.runDetectors(detectors, context);
  const records = [];
  for (const observation of observations) {
    records.push(await recordObservation(db, args, observation));
  }
  return { investigated: true, observations: records.map((r) => r.observation), findings: records.map((r) => r.finding), proposals: records.map((r) => r.proposal) };
}

module.exports = { investigate, filesFromEvents };
