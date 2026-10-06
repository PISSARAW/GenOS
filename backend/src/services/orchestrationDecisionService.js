const { emit } = require('./agentOrchestrationState');

const EVENT_HANDLERS = {
  AGENT_FAILED: { gateId: 'replay_or_escalate', action: 'replay_and_rediagnose', tool: 'genos_replay', organization: 'isolated_recovery', reason: 'A branch failed; replay its capsule before retrying a falsified hypothesis.' },
  AGENT_RUNTIME_ERROR: { gateId: 'replay_or_escalate', action: 'replay_and_rediagnose', tool: 'genos_replay', organization: 'isolated_recovery', reason: 'A branch failed; replay its capsule before retrying a falsified hypothesis.' },
  HARD_INVARIANT_FAILURE: { gateId: 'fork_or_delegate', action: 'quarantine_and_fork', tool: 'genos_snapshot', organization: 'red_blue_coevolution', reason: 'A hard safety signal requires quarantine, snapshot, and an adversarial counter-branch.' },
  CIRCUIT_BREAKER_OPEN: { gateId: 'fork_or_delegate', action: 'quarantine_and_fork', tool: 'genos_snapshot', organization: 'red_blue_coevolution', reason: 'A hard safety signal requires quarantine, snapshot, and an adversarial counter-branch.' },
  AGENT_COMPLETED_ADVICE_PROPOSAL: { gateId: 'select_or_merge_hypotheses', action: 'record_worker_experience', tool: 'genos_record_experience', organization: 'memory_compilation', reason: 'A capsule proposal returned tests and evidence; preserve its provenance before any merge decision.' },
  AGENT_COMPLETED_ADVICE: { gateId: 'select_or_merge_hypotheses', action: 'evaluate_worker_evidence', tool: 'genos_execute_primitive', organization: 'competitive_arena', reason: 'A worker returned evidence; score it before merge or further allocation.' },
  PARASITISM_MANIFEST_READY: { gateId: 'fork_or_delegate', action: 'evolve_parasitic_pressure', tool: 'genos_parasitic_pressure', organization: 'red_blue_coevolution', reason: 'A validated parasite/agent genome manifest is ready for isolated evaluation and evolution.' },
  AGENT_COMPLETED: { gateId: 'replay_or_escalate', action: 'replay_before_promotion', tool: 'genos_replay', organization: 'hierarchical_merge', reason: 'A completed branch must be replayed and compared before promotion.' },
};

function decideFromEvent(event = {}) {
  if (!event || !event.eventType) {
    emit('orchestration', 'DECISION_DROPPED', 'MISSING_EVENT_TYPE', 'Event missing eventType field', { event }, 'warning');
    return null;
  }

  let key = event.eventType;
  if (key === 'AGENT_COMPLETED' && event.payload?.advice) {
    key = event.payload?.proposal ? 'AGENT_COMPLETED_ADVICE_PROPOSAL' : 'AGENT_COMPLETED_ADVICE';
  }

  const handler = EVENT_HANDLERS[key];
  if (!handler) {
    emit('orchestration', 'DECISION_DROPPED', 'UNRECOGNIZED_EVENT_TYPE', `Unrecognized event type: ${event.eventType}`, { eventType: event.eventType, payload: event.payload }, 'warning');
    return null;
  }

  return handler;
}

function isDecisionEvent(event) {
  return Boolean(event && Object.hasOwn(EVENT_HANDLERS, event.eventType));
}

module.exports = { decideFromEvent, isDecisionEvent };
