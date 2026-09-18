const { PRIMITIVE_ALIASES } = require('../autonomousOrchestrationGates');

function phase(key, requiredTools, purpose) {
  return { key, requiredTools, purpose, required: true };
}

function toolHasPrimitive(tool, portfolioPrimitives) {
  const primitiveName = String(tool).replace(/^genos_/, '');
  const aliases = PRIMITIVE_ALIASES[primitiveName] || [primitiveName];
  return portfolioPrimitives.has(primitiveName) || portfolioPrimitives.has(tool) || aliases.some((alias) => portfolioPrimitives.has(alias));
}

function missingToolsForPhase(phaseTools, portfolioPrimitives) {
  const missing = [];
  for (const tool of phaseTools || []) {
    if (!toolHasPrimitive(tool, portfolioPrimitives)) {
      missing.push(tool);
    }
  }
  return missing;
}

function validatePhasesVsPortfolio(phases, portfolio = []) {
  const portfolioPrimitives = new Set((portfolio || []).flatMap((s) => s.primitives || []));
  const missingByPhase = {};
  for (const p of phases || []) {
    const missing = missingToolsForPhase(p.requiredTools, portfolioPrimitives);
    if (missing.length > 0) {
      missingByPhase[p.key] = missing;
    }
  }
  return { missingByPhase, canProceed: Object.keys(missingByPhase).length === 0 };
}

function filterPhasesToPortfolio(phases, portfolio = []) {
  const validation = validatePhasesVsPortfolio(phases, portfolio);
  const missingPhases = new Set(Object.keys(validation.missingByPhase));
  return phases.filter((p) => !missingPhases.has(p.key));
}

function omitPhases(phases, phaseValidation) {
  return phases
    .filter((entry) => phaseValidation.missingByPhase[entry.key])
    .map((entry) => ({ key: entry.key, missingTools: phaseValidation.missingByPhase[entry.key], required: entry.required }));
}

function buildPhases(flags, modes, branchCount) {
  if (flags.creative) return [
    phase('creative_baseline', ['genos_snapshot'], 'Preserve the brief and creative baseline.'),
    phase('literary_review', ['genos_adversarial_review'], 'Independently review coherence and constraint coverage.'),
    phase('creative_provenance', ['genos_record_decision'], 'Audit the chosen artifact and its worker influences.')
  ];
  const phases = [
    phase('retrieve_and_diagnose', ['genos_search_failures', 'genos_diagnose'], 'Retrieve negative knowledge and establish falsifiable hypotheses.'),
    phase('snapshot_before_mutation', ['genos_snapshot'], 'Create a recoverable baseline before any risky mutation.')
  ];
  if (branchCount > 1) phases.push(phase('counterfactual_forks', ['genos_fork', 'genos_solve'], 'Explore independent hypotheses in isolated branches.'));
  phases.push(phase('evidence_and_evaluation', ['genos_hypothesis_evidence', 'genos_evaluate_trajectories'], 'Score evidence and suspend dominated trajectories.'));
  if (modes.evolution) phases.push(phase('controlled_mutation', ['genos_resilience_hypermutation'], 'Use bounded mutation only after a baseline and evidence exist.'));
  // Only add competition phase if competition mode but NOT security (security uses red/blue/observer workers)
  if (modes.competition && !flags.security) phases.push(phase('competition_and_selection', ['genos_adversarial_review'], 'Run adversarial comparison and select a Pareto-safe winner.'));
  if (flags.security) phases.push(phase('red_queen', ['genos_security_coevolution'], 'Run Red/Blue/neutral-observer coevolution in isolated worlds.'));
  phases.push(phase('replay_and_promote', ['genos_replay', 'genos_record_decision'], 'Replay the selected result and preserve the rationale before promotion.'));
  return phases;
}

module.exports = { phase, buildPhases, validatePhasesVsPortfolio, filterPhasesToPortfolio, omitPhases };
