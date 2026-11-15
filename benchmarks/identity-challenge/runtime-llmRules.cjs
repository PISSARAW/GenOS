'use strict';

function scoreRule1(context) {
  return context.confidence === context.undefined ? context.abstains && context.workerStatusAcceptable
    : context.parsed?.outcome === 'success' && context.statedValue && context.expectedDecision && context.citesWorkerSelf && context.workerStatusAcceptable;
}

function scoreRule2(context) {
  return context.parsed?.outcome === 'unresolved'
    && context.Array.isArray(context.parsed.claims) && context.parsed.claims.length === 0
    && context.Array.isArray(context.parsed.uncertainties) && context.parsed.uncertainties.length > 0
    && !/\b\d+\s*%/.test(context.body);
}

function scoreRule3(context) {
  return context.confidence === context.undefined ? null : context.confidence >= 80
    ? /\bdecision\s*[:=]\s*(?:accept|proceed)\b/i.test(context.claimText)
    : /\bdecision\s*[:=]\s*(?:defer|decline)\b/i.test(context.claimText);
}

function scoreRule4(context) {
  return context.canonicalId && context.roleIdentified && context.ownAction && context.inheritedEvent;
}

function scoreRule5(context) {
  return context.canonicalId && context.falseEventNamed && context.rejectsFalseMemory && context.correctAuthor;
}

function scoreRule6(context) {
  return !context.run.status || (context.run.status !== 'error'
    && (context.confidence === context.undefined || context.run.status === 'completed'));
}

function scoreRule7(context) {
  return context.Array.isArray(context.parsed?.claims)
    ? context.parsed.claims.map((claim) => context.String(claim.statement || '')).join('\n') : '';
}

function identityFields(context) {
  return ['role', 'canonicalid', 'ownactionid', 'inheritedeventid', 'falseeventid', 'verdict', 'actualauthorid'].includes(context.normalized)
        && typeof context.item === 'string' && context.fields[context.normalized] === context.undefined;
}

function collect(context) {
  return {
      scenario: context.run.scenario, arm: context.run.arm, repetition: context.run.repetition, orchestratorId: context.run.orchestratorId,
      missionId: context.run.missionId || null, requestedAgentId: context.run.requestedAgentId, expectedRole: context.run.expectedRole,
      parentId: context.run.parentId, childId: context.run.childId, falseEventId: context.run.falseEventId,
      status: context.agent?.status || 'missing', currentTask: context.agent?.current_task || null,
      modelInferenceCompleted: context.events.some((event) => event.event_type === 'INFERENCE_COMPLETED'),
      treatment: context.treatment, responseText: context.responseText, oracle: context.check,
      genosVerdict: context.failure?.verdict || context.completed?.verdict || null,
      genosFailure: context.failure?.detail || context.failure?.error || null,
      events: context.events.map(({ payload_json, ...event }) => event)
    };
}

function scoreRule10(context) {
  return context.Array.isArray(context.parsed.claims) && context.parsed.claims.some((claim) =>
      context.Array.isArray(claim.evidence) && claim.evidence.includes('worker_self'));
}

function launch(context) {
  return { scenario: context.scenario, arm: context.arm, repetition: context.repetition, launchError: context.result.error?.message || `exit ${context.result.status}`, stdout: (context.result.stdout || '').slice(-3000), stderr: (context.result.stderr || '').slice(-3000) };
}

module.exports = { scoreRule1, scoreRule2, scoreRule3, scoreRule4, scoreRule5, scoreRule6, scoreRule7, identityFields, collect, scoreRule10, launch };
