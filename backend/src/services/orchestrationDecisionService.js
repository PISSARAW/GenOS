function decideFromEvent(event = {}) {
  if (event.eventType === 'AGENT_FAILED' || event.eventType === 'AGENT_RUNTIME_ERROR') {
    return { action: 'replay_and_rediagnose', tool: 'genos_replay', organization: 'isolated_recovery', reason: 'A branch failed; replay its capsule before retrying a falsified hypothesis.' };
  }
  if (event.eventType === 'HARD_INVARIANT_FAILURE' || event.eventType === 'CIRCUIT_BREAKER_OPEN') {
    return { action: 'quarantine_and_fork', tool: 'genos_snapshot', organization: 'red_blue_coevolution', reason: 'A hard safety signal requires quarantine, snapshot, and an adversarial counter-branch.' };
  }
  if (event.eventType === 'AGENT_COMPLETED' && event.payload?.advice) {
    return { action: 'evaluate_worker_evidence', tool: 'genos_evaluate_trajectories', organization: 'competitive_arena', reason: 'A worker returned evidence; score it before merge or further allocation.' };
  }
  if (event.eventType === 'AGENT_COMPLETED') {
    return { action: 'replay_before_promotion', tool: 'genos_replay', organization: 'hierarchical_merge', reason: 'A completed branch must be replayed and compared before promotion.' };
  }
  return null;
}

module.exports = { decideFromEvent };
