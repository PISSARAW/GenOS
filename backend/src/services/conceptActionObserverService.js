'use strict';

const lifecycle = require('./conceptActionLifecycleService');
const deadline = require('./conceptObservationDeadlineService');

async function begin(context) {
  if (process.env.GENOS_CONCEPT_ACTION_OBSERVATION !== '1') return { status: 'not_run', reason: 'disabled' };
  try { return await lifecycle.begin(context); }
  catch (_) { return { status: 'not_run', reason: 'observation_failed' }; }
}

async function finish(context, token, outcome) {
  let conceptObservation;
  let conceptLedgerPersistence = null;
  try {
    conceptObservation = token?.status === 'pending' ? await lifecycle.complete(token, outcome) : token;
    if (lifecycle.isObserved(conceptObservation)) {
      const ledger = await deadline.bounded(() => require('./conceptRuntimeService').processEvent(context.db, {
        agentId: context.agentId, event: outcome.event || { eventType: 'MCP_ACTION_OBSERVED', id: context.actionId },
        observation: { actuation: conceptObservation }
      }));
      conceptLedgerPersistence = ledger.persistence || { status: 'failed', reason: ledger.reason };
    }
  } catch (_) { conceptObservation = { status: 'not_run', reason: 'observation_failed' }; }
  return { ...outcome.result, conceptObservation, conceptLedgerPersistence };
}

module.exports = { begin, finish };
