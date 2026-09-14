const { listStrategies, getStrategy } = require('./strategyRegistry');
const {
  applyTraitBonusesOne,
  applyTraitBonusesTwo,
  applyTraitBonusesThree,
  applyTraitBonusesFour,
  applyTraitBonusesFive
} = require('./strategySelectorHelpers');

const PREFERRED_PRIMARY = {
  incident: 'mutated_incident_universes',
  unknown_cause_bug: 'falsification_forks',
  critical_refactor: 'recursive_branch_evolution',
  security: 'red_blue_coevolution',
  scientific_research: 'factorial_experiment',
  architecture_decision: 'causal_replay_intervention',
  implementation: 'n_way_counterfactual_fork',
  desktop_control: 'computer_use_direct'
};

const BRANCHES = {
  incident: ['timing_and_order', 'environment_and_latency', 'state_and_cache'],
  unknown_cause_bug: ['concurrency_or_ordering', 'state_or_cache', 'configuration_or_dependency'],
  critical_refactor: ['minimal_migration', 'modular_refactor', 'architectural_replacement'],
  security: ['red_team_simulation', 'blue_team_defense', 'independent_observer'],
  scientific_research: ['baseline_hypothesis', 'competing_hypothesis', 'replication_protocol'],
  architecture_decision: ['minimal_change', 'balanced_design', 'long_term_design'],
  implementation: ['minimal_patch', 'planned_implementation', 'independent_alternative'],
  desktop_control: ['direct_gui_manipulation', 'keyboard_shortcut_path', 'verify_after_each_step']
};

const UNCERTAINTY_DEFAULTS = { unknown_cause_bug: 0.82, scientific_research: 0.74, incident: 0.78, architecture_decision: 0.62 };
const HIGH_RISK_TYPES = ['incident', 'critical_refactor', 'security'];
const HIGH_RISK_TERMS = ['deploy', 'delete', 'payment', 'production'];
const REPRODUCIBILITY_TYPES = ['incident', 'scientific_research', 'security'];
const OBJECTIVE_CONFLICT_TYPES = ['critical_refactor', 'security', 'architecture_decision'];
const TEMPORAL_TYPES = ['incident', 'architecture_decision'];
const EVALUABILITY_TERMS = ['test', 'code', 'bug', 'refactor', 'build'];
const REVERSIBILITY_TERMS = ['deploy', 'production', 'delete'];

function getStrategyHandlers() {
  return require('../services/strategyExecutionAdapter').getHandlers();
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function firstDefined(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value;
}

function firstTruthy(value, fallback) {
  if (value) return value;
  return fallback;
}

function classifyProblem(problem = '') {
  const text = String(problem).toLowerCase();
  
  // Mission requiring literal mouse/keyboard/screen control of the local machine
  // (as opposed to writing/editing code) - must be checked before 'bug'/'fix' below.
  if (includesAny(text, ['ouvre le bloc-notes', 'ouvre notepad', 'open notepad', 'open the notepad', 'contrôle du pc', 'prends le contrôle', 'take control of the computer', 'take control of the desktop', 'computer use', 'desktop control', 'clique sur', 'click the screen', 'click on the screen', 'capture d\'écran', 'take a screenshot', 'appuie sur la touche', 'press the key', 'move the mouse', 'bouge la souris', 'contrôle clavier souris', 'keyboard and mouse'])) return 'desktop_control';
  
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

function normalizeProfileType(type, problem) {
  const resolved = type || classifyProblem(problem);
  if (!PREFERRED_PRIMARY[resolved]) return classifyProblem(`${String(resolved)} ${problem}`);
  return resolved;
}

function isHighRisk(type, text) {
  if (HIGH_RISK_TYPES.includes(type)) return true;
  return includesAny(text, HIGH_RISK_TERMS);
}

function computeComplexity(problem, highRisk) {
  const lengthFactor = Math.min(String(problem).length / 600, 0.28);
  let value = 0.42 + lengthFactor;
  if (highRisk) value += 0.18;
  return Math.min(0.95, value);
}

function resolveRisk(highRisk, type) {
  if (highRisk) return 'high';
  if (type === 'architecture_decision') return 'medium';
  return 'low';
}

function resolveEvaluability(text) {
  if (includesAny(text, EVALUABILITY_TERMS)) return 'deterministic_tests';
  return 'multi_objective_evidence';
}

function resolveReversibility(text) {
  if (includesAny(text, REVERSIBILITY_TERMS)) return 'low';
  return 'high';
}

function profileProblem(problem = '', overrides = {}) {
  const type = normalizeProfileType(overrides.type, problem);
  const text = String(problem).toLowerCase();
  const highRisk = isHighRisk(type, text);
  return {
    type,
    complexity: firstDefined(overrides.complexity, computeComplexity(problem, highRisk)),
    uncertainty: firstDefined(overrides.uncertainty, firstDefined(UNCERTAINTY_DEFAULTS[type], 0.46)),
    risk: firstTruthy(overrides.risk, resolveRisk(highRisk, type)),
    evaluability: firstTruthy(overrides.evaluability, resolveEvaluability(text)),
    reversibility: firstTruthy(overrides.reversibility, resolveReversibility(text)),
    requires_reproducibility: firstDefined(overrides.requires_reproducibility, REPRODUCIBILITY_TYPES.includes(type)),
    objectives_conflict: firstDefined(overrides.objectives_conflict, OBJECTIVE_CONFLICT_TYPES.includes(type)),
    temporal_dependency: firstDefined(overrides.temporal_dependency, TEMPORAL_TYPES.includes(type))
  };
}

function compatibilityFailure(strategy, profile) {
  if (strategy.problemTypes.includes('all') || strategy.problemTypes.includes(profile.type)) return null;
  return `not compatible with ${profile.type}`;
}

function computerUseFailure(strategy, profile) {
  if (strategy.id === 'computer_use_direct' && profile.type !== 'desktop_control') {
    return 'computer-use strategy requires a desktop_control problem';
  }
  return null;
}

function primitiveFailure(strategy) {
  const missingPrimitives = strategy.primitives.filter((primitive) => !getStrategyHandlers()[primitive]);
  if (missingPrimitives.length) return `unimplemented primitives: ${missingPrimitives.join(', ')}`;
  return null;
}

function maturityFailure(strategy, options) {
  if (strategy.maturity === 'partial') return 'strategy has incomplete primitive coverage';
  if (strategy.costLevel > options.maxCostLevel) return `cost level ${strategy.costLevel} exceeds ${options.maxCostLevel}`;
  if (strategy.maturity === 'prototype' && !options.allowPrototype) return 'prototype disabled by policy';
  if (strategy.maturity === 'experimental' && !options.allowExperimental) return 'experimental strategy disabled by policy';
  return null;
}

function highRiskFailure(strategy, profile, options) {
  if (profile.risk === 'high' && strategy.maturity !== 'implemented' && !options.allowExperimentalAtHighRisk) {
    return 'non-implemented strategy blocked for high-risk problem';
  }
  return null;
}

function eligibility(strategy, profile, options) {
  const reason = compatibilityFailure(strategy, profile)
    || computerUseFailure(strategy, profile)
    || primitiveFailure(strategy)
    || maturityFailure(strategy, options)
    || highRiskFailure(strategy, profile, options);
  if (reason) return { eligible: false, reason };
  return { eligible: true, reason: 'constraints satisfied' };
}

function baseTraitPoints(strategy, profile) {
  let score = strategy.problemTypes.includes(profile.type) ? 48 : 24;
  if (PREFERRED_PRIMARY[profile.type] === strategy.id) score += 100;
  return score;
}

function scoreStrategy(strategy, profile) {
  const traits = new Set(strategy.traits);
  const state = { score: baseTraitPoints(strategy, profile) };
  applyTraitBonusesOne(state, traits, profile);
  applyTraitBonusesTwo(state, traits, profile);
  applyTraitBonusesThree(state, traits, profile);
  applyTraitBonusesFour(state, traits, profile);
  applyTraitBonusesFive(state, traits, profile);
  state.score -= strategy.costLevel * 1.8 + strategy.latencyLevel * 1.1 + strategy.riskLevel * (profile.risk === 'low' ? 1.4 : 0.4);
  if (strategy.maturity === 'experimental') state.score -= 10;
  if (strategy.maturity === 'prototype') state.score -= 28;
  return Number(state.score.toFixed(3));
}

function resolvePortfolioSize(source) {
  const requested = Math.floor(Number(source.portfolioSize) || 12);
  return Math.max(4, Math.min(16, requested));
}

function sortEligible(decisions) {
  return decisions
    .filter((item) => item.eligible)
    .sort((a, b) => b.score - a.score || a.strategy.id.localeCompare(b.strategy.id));
}

function portfolioEligible(strategy, inhibited, decisions) {
  if (inhibited.has(strategy.id)) return false;
  const decision = decisions.find((item) => item.strategy.id === strategy.id);
  if (!decision) return false;
  return Boolean(decision.eligible);
}

function composePortfolio(ids, inhibited, decisions) {
  return [...ids]
    .map(getStrategy)
    .filter(Boolean)
    .filter((strategy) => portfolioEligible(strategy, inhibited, decisions));
}

function preferredStrategyIds(profile) {
  const ids = new Set([PREFERRED_PRIMARY[profile.type], 'retrieval_first', 'negative_knowledge', 'zero_trust', 'tool_output_validation', 'execution_guardrails']);
  if (profile.requires_reproducibility) ids.add('deterministic_replay');
  ids.add(profile.objectives_conflict ? 'pareto_frontier' : 'successive_halving');
  if (profile.complexity >= 0.7) ids.add(profile.risk === 'high' ? 'blind_adversarial_review' : 'specialist_expert_committee');
  return ids;
}

function fillUniqueFamilies(portfolio, eligible, context) {
  const { portfolioSize, inhibited, families } = context;
  for (const candidate of eligible) {
    if (portfolio.length >= portfolioSize) break;
    if (!inhibited.has(candidate.strategy.id) && !families.has(candidate.strategy.family)) {
      portfolio.push(candidate.strategy);
      families.add(candidate.strategy.family);
    }
  }
}

function fillRemaining(portfolio, eligible, context) {
  const { portfolioSize, inhibited } = context;
  for (const candidate of eligible) {
    if (portfolio.length >= portfolioSize) break;
    if (!inhibited.has(candidate.strategy.id) && !portfolio.some((item) => item.id === candidate.strategy.id)) {
      portfolio.push(candidate.strategy);
    }
  }
}

function choosePortfolio(decisions, profile) {
  const options = arguments[2] || {};
  const portfolioSize = resolvePortfolioSize(options);
  const inhibited = new Set(options.inhibitedStrategyIds || []);
  const eligible = sortEligible(decisions);
  const portfolio = composePortfolio(preferredStrategyIds(profile), inhibited, decisions);
  const families = new Set(portfolio.map((strategy) => strategy.family));
  const context = { portfolioSize, inhibited, families };
  fillUniqueFamilies(portfolio, eligible, context);
  fillRemaining(portfolio, eligible, context);
  return portfolio;
}

function planPolicies(profile) {
  return {
    allocation: profile.complexity >= 0.7 ? 'successive_halving_with_reallocation' : 'equal_minimum_then_score_weighted',
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

function resolveProblem(input) {
  return String(input.problem || input.prompt || '').trim();
}

function getMemoryInhibitedIds(input) {
  const signals = input.memorySignals;
  if (signals) return signals.inhibitedStrategyIds || [];
  return [];
}

function mergeInhibitedIds(input, memoryIds) {
  const localIds = input.inhibitedStrategyIds || [];
  return [...new Set([...localIds, ...memoryIds].map(String))];
}

function resolveOptions(input) {
  return {
    maxCostLevel: firstDefined(input.maxCostLevel, 5),
    allowExperimental: firstDefined(input.allowExperimental, false),
    allowPrototype: firstDefined(input.allowPrototype, false),
    allowExperimentalAtHighRisk: firstDefined(input.allowExperimentalAtHighRisk, false),
    portfolioSize: resolvePortfolioSize(input),
    inhibitedStrategyIds: mergeInhibitedIds(input, getMemoryInhibitedIds(input))
  };
}

function buildDecisions(profile, options) {
  return listStrategies().map((strategy) => {
    const constraint = eligibility(strategy, profile, options);
    return {
      strategy,
      eligible: constraint.eligible,
      score: constraint.eligible ? scoreStrategy(strategy, profile) : null,
      reason: constraint.reason
    };
  });
}

function scoreOf(decisions, strategy) {
  const decision = decisions.find((item) => item.strategy.id === strategy.id);
  if (decision) return firstDefined(decision.score, -Infinity);
  return -Infinity;
}

function bestByScore(portfolio, decisions) {
  return portfolio
    .slice()
    .sort((left, right) => scoreOf(decisions, right) - scoreOf(decisions, left))[0];
}

function resolvePrimary(portfolio, decisions, requestedPrimary) {
  const requested = portfolio.find((strategy) => strategy.id === requestedPrimary);
  if (requested) return requested;
  return bestByScore(portfolio, decisions);
}

function reasonForFallback(decision) {
  if (decision) return decision.reason || 'requested strategy was not eligible';
  return 'requested strategy was not eligible';
}

function buildFallback(requestedPrimary, primary, requestedDecision) {
  if (requestedPrimary === primary.id) return null;
  return {
    requested: requestedPrimary,
    selected: primary.id,
    reason: reasonForFallback(requestedDecision)
  };
}

function scoreForSort(decision) {
  return firstDefined(decision.score, -Infinity);
}

function sortDecisions(decisions) {
  return decisions.sort((a, b) => scoreForSort(b) - scoreForSort(a) || a.strategy.id.localeCompare(b.strategy.id));
}

function selectStrategyPortfolio(input = {}) {
  const problem = resolveProblem(input);
  const profile = profileProblem(problem, input.problemProfile || {});
  const options = resolveOptions(input);
  const decisions = buildDecisions(profile, options);
  const portfolio = choosePortfolio(decisions, profile, options);
  const requestedPrimary = PREFERRED_PRIMARY[profile.type];
  const requestedDecision = decisions.find((item) => item.strategy.id === requestedPrimary);
  const primary = resolvePrimary(portfolio, decisions, requestedPrimary);
  if (!primary) throw new Error('No strategy satisfies the problem constraints and maturity policy');
  const summary = summarizeDecisions(decisions, portfolio);
  const policies = planPolicies(profile);
  return {
    problem,
    profile,
    options,
    primary,
    requestedPrimary,
    primaryFallback: buildFallback(requestedPrimary, primary, requestedDecision),
    portfolio,
    policies,
    branches: BRANCHES[profile.type],
    decisions: sortDecisions(decisions),
    summary
  };
}

module.exports = { classifyProblem, profileProblem, selectStrategyPortfolio };
