function buildRemediation(realizable, omittedPhases) {
  const missingTools = [...new Set((omittedPhases || []).flatMap((entry) => entry.missingTools || []))].sort();
  if (!missingTools.length) return null;
  return {
    status: realizable.length ? 'partial_contract' : 'no_executable_phase',
    missingTools,
    executablePhaseKeys: realizable.map((entry) => entry.key),
    recommendedAction: realizable.length ? 'continue_with_realizable_phases_or_change_strategy' : 'change_strategy_before_runtime_start',
    reason: realizable.length
      ? 'The current strategy portfolio omits required tools for some autonomy phases.'
      : 'The current strategy portfolio cannot execute any autonomy phase.'
  };
}

module.exports = { buildRemediation };