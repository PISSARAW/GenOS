'use strict';

const store = require('../holobiontStore');
const trinity = require('../../trinityService');
const { normalizeSymbiontKind } = require('./symbiontKinds');

function validateTriplet(candidates, reports) {
  if (!Array.isArray(candidates) || candidates.length !== 3 || !Array.isArray(reports) || reports.length !== 3) {
    throw Object.assign(new Error('Trinity requires three candidates and three world reports.'), { code: 'HOLOBIONT_TRINITY_TRIPLET_REQUIRED' });
  }
  const worlds = new Set(candidates.map((item) => Number(item.worldNumber)));
  if ([...worlds].sort().join(',') !== '1,2,3') {
    throw Object.assign(new Error('Trinity candidates must map to worlds 1, 2 and 3.'), { code: 'HOLOBIONT_TRINITY_TRIPLET_INVALID' });
  }
}

function evidenceRefs(report) {
  const claims = Array.isArray(report?.claims) ? report.claims : [];
  const refs = claims.flatMap((claim) => [claim.evidence, claim.receipts, claim.sourceRefs]
    .flatMap((items) => Array.isArray(items) ? items : []))
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean);
  return [...new Set(refs)];
}

function winnerCandidate(comparison, candidates, reports) {
  if (!comparison.canMerge) return null;
  const candidate = candidates.find((item) => Number(item.worldNumber) === comparison.selectedWorld);
  const report = reports.find((item) => Number(item.worldNumber) === comparison.selectedWorld);
  const refs = evidenceRefs(report?.report || report);
  if (!candidate || !report || !refs.length) {
    throw Object.assign(new Error('Trinity winner is missing its candidate or evidence.'), { code: 'HOLOBIONT_TRINITY_EVIDENCE_REQUIRED' });
  }
  const capability = String(candidate.capability || '').trim();
  if (!capability || !Array.isArray(candidate.capabilities) || !candidate.capabilities.includes(capability)) {
    throw Object.assign(new Error('The selected symbiont must provide the requested capability.'), { code: 'HOLOBIONT_CAPABILITY_OUT_OF_SCOPE' });
  }
  return { candidate, refs };
}

function compareCandidates(input) {
  validateTriplet(input.candidates, input.worldReports);
  const comparison = trinity.mergeTrinityEvidence(input.worldReports, {
    domain: input.domain, threshold: input.threshold, maxLatencyMs: input.maxLatencyMs
  });
  const winner = winnerCandidate(comparison, input.candidates, input.worldReports);
  return { comparison, winner };
}

async function stageWinner(db, context, input) {
  const { session, winner, comparison } = context;
  if (!winner) return { status: 'NEEDS_REVIEW', comparison };
  const candidate = winner.candidate;
  const symbiontId = `trinity:${String(candidate.symbiontId || '').trim()}`;
  if (symbiontId === 'trinity:') throw Object.assign(new Error('Selected symbiontId is required.'), { code: 'HOLOBIONT_SYMBIONT_UNKNOWN' });
  const symbiont = {
    id: symbiontId, kind: normalizeSymbiontKind(candidate.kind), origin: 'TRINITY',
    worldNumber: comparison.selectedWorld, capabilities: candidate.capabilities,
    evidenceRefs: winner.refs,
    comparison: { outcome: comparison.outcome, selectedWorld: comparison.selectedWorld, bestScore: comparison.bestScore }
  };
  const sessionRevision = await store.appendEvent(db, {
    holobiontId: session.holobiontId, expectedRevision: session.revision,
    eventType: 'SYMBIONT_DISCOVERED', actorId: input.actorId,
    payload: { symbiontId, symbiont }
  });
  return { status: 'CANDIDATE', symbiont, comparison, sessionRevision };
}

async function selectTrinitySymbiont(db, input = {}) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw Object.assign(new Error('Holobiont session not found.'), { code: 'HOLOBIONT_SESSION_NOT_FOUND' });
  if (session.scope !== 'PERSISTENT') {
    throw Object.assign(new Error('Trinity integration requires a persistent Host.'), { code: 'HOLOBIONT_PERSISTENT_HOST_REQUIRED' });
  }
  if (Number(input.expectedSessionRevision) !== session.revision) {
    throw Object.assign(new Error('Holobiont revision conflict.'), { code: 'HOLOBIONT_REVISION_CONFLICT' });
  }
  const result = compareCandidates(input);
  return stageWinner(db, { session, ...result }, input);
}

module.exports = { selectTrinitySymbiont, compareCandidates };
