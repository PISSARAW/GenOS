'use strict';

function record(ctx, event, error) {
  ctx.state.missionDomainState.hasDomainFailure = true;
  ctx.state.missionDomainState.domainVerdict = 'failed';
  ctx.state.eventProcessingFailure = { eventId: event.id, message: error.message };
  require('./agentOrchestrationState').emit(ctx.agentId, 'RUNTIME_EVENT_PROCESSING_FAILED', 'EVIDENCE_GATE', error.message, {
    sourceEventId: event.id, sourceEventType: event.eventType
  }, 'error');
  ctx.haltRuntime(ctx, 'event_processing', error.message, 'Runtime halted because its event could not be persisted or validated.');
}

module.exports = { record };
