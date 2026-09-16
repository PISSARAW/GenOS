function workerRole([label, hypothesis, role, modelTier]) {
  return { label, hypothesis, role, modelTier };
}

function buildWorkers(flags, branches) {
  if (flags.security) {
    return [
      workerRole(['red', 'Find adversarial failure modes.', 'red_team', 'frontier']),
      workerRole(['blue', 'Defend against the red-team findings.', 'blue_team', 'frontier']),
      workerRole(['observer', 'Independently verify claims and veto unsupported conclusions.', 'neutral_observer', 'standard'])
    ];
  }
  return branches.map((branch, index) => workerRole([
    branch.label,
    branch.hypothesis,
    index === 0 ? 'implementation' : 'independent_reviewer',
    index === 0 ? 'frontier' : 'standard'
  ]));
}

module.exports = { workerRole, buildWorkers };