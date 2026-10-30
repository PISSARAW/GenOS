'use strict';

const { digest } = require('./biologicalIntegrity');

function matchingTerminal(observations, event) {
  return observations.find(item => item.applied && item.event.eventType === 'AGENT_COMPLETED'
    && digest(item.event.payload?.nativeOracleRef) === digest(event.nativeOracleRef)
    && digest(item.event.payload?.evidenceReport) === digest(event.evidenceReport));
}

async function currentScopeMatches(db, workerId, verification) {
  if (!require('./biologicalWorkerReceiptService').semanticProofAccepted(verification)) return false;
  const scope = await require('./gvxMissionProvenance').agentScope(db, workerId);
  return Boolean(scope && digest(scope) === digest(verification.proof.attestation.value.scope));
}

async function trustedEvent(input) {
  const { db, missionId, workerId, event } = input;
  if (!db || !event?.executionRunId || !event?.nativeOracleRef) return false;
  try {
    const store = require('./biologicalWorkerStore');
    const binding = await store.binding(db, event.executionRunId);
    if (binding?.missionId !== missionId || binding?.workerId !== workerId) return false;
    const observations = await store.observations(db, event.executionRunId);
    const terminal = matchingTerminal(observations, event);
    if (!terminal) return false;
    const verification = await require('./epistemic/nativeOracleGate').historical(db,
      { runId: event.executionRunId, agentId: workerId, event: terminal.event });
    return await currentScopeMatches(db, workerId, verification);
  } catch { return false; }
}

async function validateDossiers(db, missionId, dossiers) {
  return Promise.all((dossiers || []).map(async dossier => ({ ...dossier,
    events: await Promise.all((dossier.events || []).map(async event => {
      if (!event.nativeOracleRef || await trustedEvent({ db, missionId, workerId: dossier.workerId, event })) return event;
      return { ...event, nativeOracleRef: null };
    })) })));
}

module.exports = { trustedEvent, validateDossiers };
