const { listStrategies, getStrategy } = require('./strategyRegistry');

const PREFERRED_PRIMARY = {
  incident: 'mutated_incident_universes',
  unknown_cause_bug: 'falsification_forks',
  critical_refactor: 'recursive_branch_evolution',
  security: 'red_blue_coevolution',
  scientific_research: 'factorial_experiment',
  architecture_decision: 'causal_replay_intervention',
  implementation: 'n_way_counterfactual_fork'
};

const BRANCHES = {
  incident: ['timing_and_order', 'environment_and_latency', 'state_and_cache'],
  unknown_cause_bug: ['concurrency_or_ordering', 'state_or_cache', 'configuration_or_dependency'],
  critical_refactor: ['minimal_migration', 'modular_refactor', 'architectural_replacement'],
  security: ['red_team_simulation', 'blue_team_defense', 'independent_observer'],
  scientific_research: ['baseline_hypothesis', 'competing_hypothesis', 'replication_protocol'],
  architecture_decision: ['minimal_change', 'balanced_design', 'long_term_design'],
  implementation: ['minimal_patch', 'planned_implementation', 'independent_alternative']
};

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function classifyProblem(problem = '') {
  const text = String(problem).toLowerCase();
  
  // Mapping direct si le texte correspond exactement ou est pré-typé
  if (text.includes('critical_bug_fix') || text.includes('hotfix') || includesAny(text, ['incident', 'production', 'intermittent', 'rare crash', 'outage', 'p0', 'sev1'])) return 'incident';
  
  if (includesAny(text, ['unknown cause', 'root cause', 'cause inconnue', 'diagnose', 'debug', 'investigate', 'why does it', 'bug', 'fix'])) return 'unknown_cause_bug';
  
  if (includesAny(text, ['security', 'vulnerability', 'threat', 'attack', 'sécurité', 'cve', 'exploit', 'injection'])) return 'security';
  
  if (includesAny(text, ['research', 'hypothesis', 'scientific', 'experiment', 'recherche', 'poc', 'proof of concept', 'benchmark'])) return 'scientific_research';
  
  if (includesAny(text, ['refactor', 'migration', 'monolith', 'rewrite', 'architecture critique', 'legacy', 'technical debt'])) return 'critical_refactor';
  
  if (includesAny(text, ['architecture', 'decision', 'trade-off', 'compare options', 'choisir', 'design doc', 'system design'])) return 'architecture_decision';
  
  // Par défaut, si c'est une feature request ou une tâche simple
  return 'implementation';
}

function profileProblem(problem = '', overrides = {}) {
  let type = overrides.type || classifyProblem(problem);
  
  // Normalize known external typologies (e.g., from JIRA/GitHub or direct injection)
  if (!PREFERRED_PRIMARY[type]) {
    // If it's an unrecognized explicit type, fall back to classification
    type = classifyProblem(String(type) + ' ' + problem);
  }

  const text = String(problem).toLowerCase();
  const highRisk = ['incident', 'critical_refactor', 'security'].includes(type) || includesAny(text, ['deploy', 'delete', 'payment', 'production']);
  const uncertaintyDefaults = { unknown_cause_bug: 0.82, scientific_research: 0.74, incident: 0.78, architecture_decision: 0.62 };
  return {
    type,
    complexity: overrides.complexity ?? Math.min(0.95, 0.42 + Math.min(String(problem).length / 600, 0.28) + (highRisk ? 0.18 : 0)),
    uncertainty: overrides.uncertainty ?? uncertaintyDefaults[type] ?? 0.46,
    risk: overrides.risk || (highRisk ? 'high' : type === 'architecture_decision' ? 'medium' : 'low'),
    evaluability: overrides.evaluability || (includesAny(text, ['test', 'code', 'bug', 'refactor', 'build']) ? 'deterministic_tests' : 'multi_objective_evidence'),
    reversibility: overrides.reversibility || (includesAny(text, ['deploy', 'production', 'delete']) ? 'low' : 'high'),
    requires_reproducibility: overrides.requires_reproducibility ?? ['incident', 'scientific_research', 'security'].includes(type),
    objectives_conflict: overrides.objectives_conflict ?? ['critical_refactor', 'security', 'architecture_decision'].includes(type),
    temporal_dependency: overrides.temporal_dependency ?? ['incident', 'architecture_decision'].includes(type)
  };
}

function eligibility(strategy, profile, options) {
  const compatible = strategy.problemTypes.includes('all') || strategy.problemTypes.includes(profile.type);
  if (!compatible) return { eligible: false, reason: `not compatible with ${profile.type}` };
  if (strategy.costLevel > options.maxCostLevel) return { eligible: false, reason: `cost level ${strategy.costLevel} exceeds ${options.maxCostLevel}` };
  if (strategy.maturity === 'prototype' && !options.allowPrototype) return { eligible: false, reason: 'prototype disabled by policy' };
  if (strategy.maturity === 'experimental' && !options.allowExperimental) return { eligible: false, reason: 'experimental strategy disabled by policy' };
  if (profile.risk === 'high' && strategy.maturity !== 'implemented' && !options.allowExperimentalAtHighRisk) {
    return { eligible: false, reason: 'non-implemented strategy blocked for high-risk problem' };
  }
  return { eligible: true, reason: 'constraints satisfied' };
}

function scoreStrategy(strategy, profile) {
  const traits = new Set(strategy.traits);
  let score = strategy.problemTypes.includes(profile.type) ? 48 : 24;
  if (PREFERRED_PRIMARY[profile.type] === strategy.id) score += 100;
  if (traits.has('information_gain')) score += profile.uncertainty * 24;
  if (traits.has('deep_search')) score += profile.complexity * 18;
  if (traits.has('safety')) score += profile.risk === 'high' ? 24 : 7;
  if (traits.has('reproducible') && profile.requires_reproducibility) score += 17;
  if (traits.has('temporal') && profile.temporal_dependency) score += 15;
  if (traits.has('multi_objective') && profile.objectives_conflict) score += 18;
  if (traits.has('verification') && profile.evaluability === 'deterministic_tests') score += 13;
  if (traits.has('low_cost')) score += 6;
  if (traits.has('human_gate') && profile.risk === 'high') score += 11;
  score -= strategy.costLevel * 1.8 + strategy.latencyLevel * 1.1 + strategy.riskLevel * (profile.risk === 'low' ? 1.4 : 0.4);
  if (strategy.maturity === 'experimental') score -= 10;
  if (strategy.maturity === 'prototype') score -= 28;
  return Number(score.toFixed(3));
}

function choosePortfolio(decisions, profile) {
  const eligible = decisions.filter((item) => item.eligible).sort((a, b) => b.score - a.score || a.strategy.id.localeCompare(b.strategy.id));
  const ids = new Set([PREFERRED_PRIMARY[profile.type], 'retrieval_first', 'negative_knowledge', 'zero_trust', 'tool_output_validation', 'execution_guardrails']);
  if (profile.requires_reproducibility) ids.add('deterministic_replay');
  ids.add(profile.objectives_conflict ? 'pareto_frontier' : 'successive_halving');
  if (profile.complexity >= 0.7) ids.add(profile.risk === 'high' ? 'blind_adversarial_review' : 'specialist_expert_committee');
  const portfolio = [...ids].map(getStrategy).filter(Boolean).filter((strategy) => decisions.find((item) => item.strategy.id === strategy.id)?.eligible);
  for (const candidate of eligible) {
    if (portfolio.length >= 10) break;
    if (!portfolio.some((item) => item.family === candidate.strategy.family)) portfolio.push(candidate.strategy);
  }
  return portfolio;
}

function planPolicies(profile) {
  return {
    allocation: profile.complexity >= 0.7 ? 'successive_halving_with_recursive_reallocation' : 'equal_minimum_then_score_weighted',
    evaluation: profile.objectives_conflict ? 'pareto_frontier_and_knee_point' : profile.evaluability === 'deterministic_tests' ? 'hard_tests_then_weighted_fitness' : 'evidence_weighted_fitness',
    merge: profile.risk === 'high' ? 'human_approved_cognitive_merge' : 'conditional_winner_promotion'
  };
}

function summarizeDecisions(decisions, portfolio) {
  const selected = new Set(portfolio.map((strategy) => strategy.id));
  const statuses = { selected: 0, eligible_not_selected: 0, ineligible: 0 };
  const maturity = {};
  const family = {};
  for (const decision of decisions) {
    decision.status = selected.has(decision.strategy.id) ? 'selected' : decision.eligible ? 'eligible_not_selected' : 'ineligible';
    decision.reason = decision.status === 'selected' ? 'selected for the composed execution portfolio' : decision.reason;
    statuses[decision.status] += 1;
    maturity[decision.strategy.maturity] = (maturity[decision.strategy.maturity] || 0) + 1;
    family[decision.strategy.family] = (family[decision.strategy.family] || 0) + 1;
  }
  return { total_registry: decisions.length, ...statuses, by_maturity: maturity, by_family: family };
}

function selectStrategyPortfolio(input = {}) {
  const problem = String(input.problem || input.prompt || '').trim();
  const profile = profileProblem(problem, input.problemProfile || {});
  const options = {
    maxCostLevel: input.maxCostLevel ?? 5,
    allowExperimental: input.allowExperimental ?? false,
    allowPrototype: input.allowPrototype ?? false,
    allowExperimentalAtHighRisk: input.allowExperimentalAtHighRisk ?? false
  };
  const decisions = listStrategies().map((strategy) => {
    const constraint = eligibility(strategy, profile, options);
    return { strategy, eligible: constraint.eligible, score: constraint.eligible ? scoreStrategy(strategy, profile) : null, reason: constraint.reason };
  });
  const portfolio = choosePortfolio(decisions, profile);
  const primary = portfolio.find((strategy) => strategy.id === PREFERRED_PRIMARY[profile.type]) || portfolio[0];
  if (!primary) throw new Error('No strategy satisfies the problem constraints and maturity policy');
  const summary = summarizeDecisions(decisions, portfolio);
  const policies = planPolicies(profile);
  return {
    problem, profile, options, primary, portfolio, policies,
    branches: BRANCHES[profile.type],
    decisions: decisions.sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.strategy.id.localeCompare(b.strategy.id)),
    summary
  };
}

module.exports = { classifyProblem, profileProblem, selectStrategyPortfolio };
