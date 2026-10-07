'use strict';

const journal = require('./nativeOracleJournal');
const gate = require('./nativeOracleGate');
const proofs = require('./nativeOracleProof');

async function inspect(db, request) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='gvx_development_events'");
  if (table?.name !== 'gvx_development_events') return { status: 'unavailable' };
  const scope = await require('../gvxMissionProvenance').agentScope(db, request.agentId);
  if (!scope) return { status: 'unavailable' };
  const allocation = await journal.read(db, { ...request, scope, kind: 'reservation' });
  if (!allocation) return { status: 'not_evaluated' };
  const attestation = await journal.read(db, { ...request, scope, kind: 'attestation' });
  if (!attestation) return { status: 'reserved', limits: allocation.value.limits, expiresAt: allocation.value.expiresAt };
  if (!attestation.value.accepted) return { status: 'refused', costs: attestation.value.costs, promotionAllowed: false };
  return acceptedView(db, { ...request, attestation, allocation });
}

async function acceptedView(db, input) {
  const observations = await require('../biologicalWorkerStore').observations(db, input.runId);
  const terminal = observations.filter(item => item.event.eventType === 'AGENT_COMPLETED').at(-1);
  const accepted = terminal && await gate.historical(db, { ...input, event: terminal.event });
  if (!accepted) return { status: 'attested', costs: input.attestation.value.costs, promotionAllowed: false };
  let current = { satisfied: true, reason: null };
  try { await proofs.assertCurrent(db, { proof: accepted.proof, request: input,
    report: terminal.event.payload.evidenceReport || terminal.event.payload.report }); }
  catch (failure) { current = { satisfied: false, reason: failure.code || failure.message }; }
  return { status: 'accepted_at_decision', domain: require('./nativeOracleDomains').definition(input.attestation.value.domain).subject.DOMAIN,
    decision: { status: accepted.acceptance.value.status, at: accepted.acceptance.value.decidedAt,
      hash: accepted.acceptance.hash }, attestation: { eventId: input.attestation.eventId, hash: input.attestation.hash },
    costs: input.attestation.value.costs, limits: input.allocation.value.limits,
    validUntil: input.attestation.value.validUntil, current, promotionAllowed: false };
}

module.exports = { inspect };
