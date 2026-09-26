'use strict';

const crypto = require('crypto');
const trinityAdapters = require('./trinityAdapters');

const AXES = Object.freeze({
  worldTopology: {
    fixed_three: policy('implemented'),
    factorial_grid: policy('implemented', [
      'Generate all combinations of strategies × models × tools as specified.',
      'Each combination runs as an independent sealed world with equal budget.',
      'Report results in a structured grid for ANOVA/hierarchical analysis.'
    ], { requiredAdapter: 'factorial_grid_executor' }),
    recursive_nesting: policy('implemented', [
      'Allow a chamber to spawn a nested Trinity for a scoped sub-problem.',
      'Respect recursionBudget, maxDepth, and marginalCostThreshold.',
      'Return verified sub-result, not raw text; parent evidence graph tracks lineage.'
    ], { requiredAdapter: 'recursive_trinity_executor' }),
    temporal_horizons: policy('implemented', [
      'Assign each world a distinct temporal horizon and value function.',
      'Short: immediate effects; Medium: integration & maintenance; Long: reversibility & options.',
      'Compare outcomes across horizons with temporal-value discounting.'
    ], { requiredAdapter: 'temporal_horizon_executor' }),
    oracular_prediction: policy('implemented', [
      'One world predicts which process will perform best (ex-ante).',
      'Other worlds execute; oracle scored post-hoc with Brier/log-loss.',
      'Oracle history accumulates for routing learning; never replaces verification.'
    ], { requiredAdapter: 'oracular_executor' }),
    exploratory_novelty: policy('implemented', [
      'Maximize behavioral/structural novelty via Quality-Diversity search.',
      'Maintain novelty archive; select for quality × novelty, not convergence.',
      'Final selection from niches; anti-convergence pressure enforced.'
    ], { requiredAdapter: 'exploratory_novelty_executor' })
  },
  hypothesisPolicy: {
    fixed_triplet: policy('implemented', ['Keep the assigned hypothesis fixed for this world.']),
    counterfactual_dimensions: policy('implemented', [
      'Baseline world: solve under mission premise.',
      'Favorable world: apply favorable intervention; label conclusions conditional.',
      'Adverse world: apply adverse intervention; label conclusions conditional.',
      'Report delta between worlds; identify responsible variables via causal attribution.'
    ], { requiredAdapter: 'counterfactual_fork_executor' }),
    novelty_seeking: policy('implemented', [
      'Direct: low-assumption approach; report novelty separately from verified quality.',
      'Structured: structurally different approach; report novelty separately.',
      'Counterintuitive: unexpected approach; report novelty separately.',
      'Archive novelty vectors; compute semantic/structural distance.'
    ], { requiredAdapter: 'novelty_archive' }),
    recursive_decomposition: policy('implemented', [
      'Identify hardest sub-problem in sealed phase.',
      'Spawn nested Trinity with own budget/depth; return verified result.',
      'Parent aggregates sub-results into evidence graph.'
    ], { requiredAdapter: 'recursive_decomposition_planner' }),
    oracle_prediction: policy('implemented', [
      'Predict performance of other worlds/processes ex-ante.',
      'Specify prediction as distribution; score with Brier/log-loss post-hoc.',
      'Accumulate calibration history; use for routing, not decision override.'
    ], { requiredAdapter: 'oracle_predictor' })
  },
  diversityPolicy: {
    strategy_controlled: policy('implemented', ['Use the assigned strategy; do not borrow from another world.']),
    heterogeneous: policy('implemented', [
      'Optimize provider/model family/cognitive recipe/tools/lineage/error correlation.',
      'Reject or flag triplet below diversity threshold.',
      'Use empirical historical failure correlation to maximize independence.'
    ], { requiredAdapter: 'diversity_planner' }),
    provider_diverse: policy('implemented', [
      'Each world uses a different LLM provider (e.g., OpenAI, Anthropic, local).',
      'Report provider, model family, and toolchain per world.',
      'Enforce minimum provider diversity threshold.'
    ], { requiredAdapter: 'provider_diversity_enforcer' })
  },
  interactionPolicy: {
    sealed: policy('implemented'),
    adversarial_review_prep: policy('implemented', [
      'State falsifiable claims and how they could be challenged post-sealed.',
      'Define independent checks for adjudicating conflicting claims.',
      'Prepare reproducible counterexample checks; no peer inspection during sealed.'
    ]),
    adversarial_cross_examination: policy('implemented', [
      'Phase 1: All worlds generate independently (sealed).',
      'Phase 2: Attacker world receives defender dossier; produces typed claims, counterexamples, refutations.',
      'Phase 3: Arbiter (deterministic or jury) evaluates attack/defense with evidence gates.',
      'No world bypasses evidence gates; arbiter cannot override deterministic verification.'
    ], { requiredAdapter: 'adversarial_cross_examiner' }),
    jury_deliberation: policy('implemented', [
      'Blind jury evaluates anonymized dossiers post-comparison.',
      'Jury advice is advisory only; cannot override evidence gates.',
      'Calibration: track jury agreement with deterministic outcomes.'
    ], { requiredAdapter: 'blind_jury_adjudicator' })
  },
  objectivePolicy: {
    shared_evidence_vector: policy('implemented'),
    pareto_orthogonal: policy('implemented', [
      'Each chamber receives an explicit objectiveProfile (weights over evidence vector).',
      'World 1: correctness/coverage; World 2: latency/reproducibility; World 3: cost/risk.',
      'Hard constraints shared; Pareto frontier explained via hypervolume.',
      'Synthesis triggered if frontier claims are evidence-backed and mission-linked.'
    ], { requiredAdapter: 'pareto_objective_assigner' }),
    multi_objective_scalarized: policy('implemented', [
      'Scalarize multiple objectives with configurable weights per world.',
      'Report both scalarized score and full vector for transparency.',
      'Enable sensitivity analysis on weight perturbations.'
    ], { requiredAdapter: 'multi_objective_scalarizer' })
  },
  temporalPolicy: {
    single_horizon: policy('implemented'),
    short_medium_long: policy('implemented', [
      'World 1: immediate effects (t=0..H1); value function V1.',
      'World 2: near-term integration (t=H1..H2); value function V2.',
      'World 3: long-term maintenance/reversibility (t=H2..∞); value function V3.',
      'Report deferred effects, reversibility, technical debt, option value.'
    ], { requiredAdapter: 'temporal_value_model' }),
    multi_horizon_grid: policy('implemented', [
      'Cross strategies × horizons for full factorial temporal analysis.',
      'Each cell: strategy × horizon with dedicated budget.',
      'Analyze interaction effects: strategy × horizon.'
    ], { requiredAdapter: 'temporal_grid_executor' })
  },
  replicationPolicy: {
    fixed_three: policy('implemented'),
    adaptive_budget_fixed_replicas: policy('implemented', [
      'Redistribute budget pool based on verified uncertainty (evidenceVector.uncertainty).',
      'Replica count fixed at three; minimum tokens per world enforced.',
      'Allocation proportional to (0.1 + uncertainty); remainder distributed round-robin.'
    ], { adaptiveBudget: true, requiredAdapter: 'adaptive_budget_scheduler' }),
    adaptive_replica_count: policy('implemented', [
      'Sequential experimental design: allocate replicas based on information gain.',
      'Minimum replicas per arm enforced; never eliminate diversity prematurely.',
      'Bias correction for adaptive sampling (inverse probability weighting).',
      'Stopping rules: max budget, min uncertainty, or max replicas reached.'
    ], { requiredAdapter: 'sequential_design_scheduler' }),
    quality_diversity_replicas: policy('implemented', [
      'Replicate to fill novelty archive niches (Quality-Diversity).',
      'Each replica targets a different behavioral niche.',
      'Selection pressure: quality × novelty, not convergence.'
    ], { requiredAdapter: 'qd_replica_scheduler' })
  },
  adjudicationPolicy: {
    evidence_gated: policy('implemented'),
    blind_jury_advisory: policy('implemented', [
      'Anonymize dossiers; jury votes on preferred candidate.',
      'Calibration: track historical agreement with deterministic Pareto.',
      'Diversity: require distinct model URIs; measure inter-judge agreement.',
      'Abstention allowed; confidence-weighted scoring.',
      'Decision authority remains "none"; evidence gates are final.'
    ], { requiresJury: true, requiredAdapter: 'blind_jury_adjudicator' }),
    deterministic_only: policy('implemented', [
      'No jury; promotion solely via evidence gates and Pareto comparator.',
      'Escalate on frontier size > 1 or all worlds failing gates.'
    ])
  }
});

const AXIS_NAMES = Object.freeze(Object.keys(AXES));
const DEFAULT_DESIGN = Object.freeze({
  worldTopology: 'fixed_three', hypothesisPolicy: 'fixed_triplet',
  diversityPolicy: 'strategy_controlled', interactionPolicy: 'sealed',
  objectivePolicy: 'shared_evidence_vector', temporalPolicy: 'single_horizon',
  replicationPolicy: 'fixed_three', adjudicationPolicy: 'evidence_gated'
});

const DEFINITIONS = Object.freeze({
  controlled: variant(/baseline|controlled|reproducible|contrôlé|reproductible/i, {
    worldTopology: 'fixed_three', hypothesisPolicy: 'fixed_triplet',
    diversityPolicy: 'strategy_controlled', interactionPolicy: 'sealed',
    objectivePolicy: 'shared_evidence_vector', temporalPolicy: 'single_horizon',
    replicationPolicy: 'fixed_three', adjudicationPolicy: 'evidence_gated'
  }),
  heterogeneous: variant(/divers|heterogeneous|monoculture|providers|fournisseurs/i, {
    diversityPolicy: 'heterogeneous'
  }),
  adversarial: variant(/security|sécurité|attack|attaque|threat|menace|falsif|robust/i, {
    interactionPolicy: 'adversarial_cross_examination'
  }),
  counterfactual: variant(/counterfactual|contrefactuel|sensitivity|sensibilité|what if|et si/i, {
    hypothesisPolicy: 'counterfactual_dimensions'
  }),
  factorial: variant(/factorial|factoriel|causal|attribution|ablation/i, {
    worldTopology: 'factorial_grid'
  }),
  pareto: variant(/pareto|multi.objective|multi.objectif|cost|coût|latency|latence/i, {
    objectivePolicy: 'pareto_orthogonal'
  }),
  jury: variant(/jury|blind|aveugle|impartial|anonymous|anonyme/i, {
    adjudicationPolicy: 'blind_jury_advisory'
  }),
  recursive: variant(/recursive|récurs|subproblem|sous.problème|decompos/i, {
    worldTopology: 'recursive_nesting', hypothesisPolicy: 'recursive_decomposition'
  }),
  adaptive: variant(/adaptive|adaptatif|dynamic budget|budget dynamique|resource allocation/i, {
    replicationPolicy: 'adaptive_budget_fixed_replicas'
  }),
  temporal: variant(/urgent|deadline|long.term|long terme|horizon|temporal/i, {
    temporalPolicy: 'short_medium_long'
  }),
  oracular: variant(/oracle|oracular|meta.reason|méta.raison|predict.*winner/i, {
    worldTopology: 'oracular_prediction', hypothesisPolicy: 'oracle_prediction'
  }),
  exploratory: variant(/creative|créatif|open.ended|problème ouvert|novel|nouveau|brainstorm|explor/i, {
    hypothesisPolicy: 'novelty_seeking', replicationPolicy: 'quality_diversity_replicas'
  })
});

const PRIORITY = Object.freeze([
  'adversarial', 'pareto', 'temporal', 'exploratory', 'counterfactual', 'factorial',
  'recursive', 'jury', 'adaptive', 'heterogeneous', 'oracular', 'controlled'
]);

function policy(maturity, instructions = [], effects = {}) {
  return Object.freeze({ maturity, instructions, ...effects });
}

function variant(signals, design) {
  let maturity;
  try {
    maturity = compileExperimentalDesign(design).maturity;
  } catch (_) {
    maturity = 'conceptual';
  }
  return Object.freeze({ signals, maturity, design: Object.freeze({ ...design }) });
}

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/^trinity[-_]/, '').replaceAll('-', '_');
}

function selectForMission(mission, options = {}) {
  const explicit = options.variantId || options.variant;
  if (options.experimentalDesign && explicit) {
    throw variantError('TRINITY_DESIGN_CONFLICT', 'Choose either variantId or experimentalDesign, not both.');
  }
  if (options.experimentalDesign) return composeSelection(options.experimentalDesign, options, mission);
  if (explicit) return selectNamedVariant(explicit, options, mission);
  return automaticSelection(mission, options);
}

function selectNamedVariant(value, options, mission) {
  const variantId = normalize(value);
  const preset = DEFINITIONS[variantId];
  if (!preset) throw variantError('TRINITY_VARIANT_UNKNOWN', `Unknown Trinity variant '${value}'.`);
  return createReceipt({ variantId, design: preset.design, method: 'explicit', reasons: ['EXPLICIT_VARIANT'], confidence: 1, options, mission });
}

function automaticSelection(mission, options) {
  const text = String(mission || '');
  const recommended = PRIORITY.find((id) => DEFINITIONS[id].signals.test(text));
  const design = automaticDesign(recommended, options);
  const receipt = createReceipt(automaticReceiptInput({ recommended, design, options, mission: text }));
  return withSuggestedVariant(receipt, recommended, design);
}

function automaticDesign(recommended, options) {
  const preset = recommended ? DEFINITIONS[recommended] : null;
  return preset && isExecutable(preset.design, options) ? preset.design : {};
}

function automaticReceiptInput(input) {
  const { recommended, design, options, mission } = input;
  const hasDesign = designSize(design) > 0;
  return {
    variantId: hasDesign ? 'composed' : 'controlled', design,
    method: hasDesign ? 'mission_signals' : 'safe_baseline',
    reasons: hasDesign ? [`MISSION_POLICIES:${Object.values(design).join(',')}`] : ['CONTROLLED_BASELINE'],
    confidence: hasDesign ? 0.8 : 0.5, options, mission,
    recommended: recommended && !hasDesign ? recommended : null
  };
}

function withSuggestedVariant(receipt, recommended, design) {
  if (recommended && !designSize(design)) receipt.suggestedVariant = recommended;
  return receipt;
}

function isExecutable(design, options) {
  try {
    const compiled = compileExperimentalDesign(design);
    validatePreconditions(compiled, options);
    return true;
  } catch (_) {
    return false;
  }
}

function composeSelection(design, options, mission) {
  const compiled = compileExperimentalDesign(design);
  validatePreconditions(compiled, options);
  return createReceipt({ variantId: 'composed', design: compiled.design, method: 'explicit_design',
    reasons: ['EXPLICIT_EXPERIMENTAL_DESIGN'], confidence: 1, options, mission, compiled });
}

function createReceipt(input) {
  const { variantId, design, method, reasons, confidence, options, mission, compiled = null } = input;
  const result = compiled || compileExperimentalDesign(design);
  validatePreconditions(result, options);
  const receipt = {
    topology: 'trinity', variant: variantId, method, reasons, confidence,
    experimentalDesignVersion: 1,
    maturity: result.maturity, experimentalDesign: result.design,
    executionLimits: result.executionLimits,
    experimentalDesignId: designId(mission, result.design, options)
  };
  if (Object.keys(result.effects).length) receipt.effects = result.effects;
  return receipt;
}

function compileExperimentalDesign(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw variantError('TRINITY_DESIGN_INVALID', 'Experimental design must be an object of policy axes.');
  }
  const design = { ...DEFAULT_DESIGN, ...input };
  rejectUnknownAxes(input);
  const executionLimits = [];
  const effects = {};
  const requiredAdapters = [];
  let partial = false;
  for (const axis of AXIS_NAMES) {
    const selected = AXES[axis][design[axis]];
    if (!selected) throw variantError('TRINITY_POLICY_UNKNOWN', `Unknown ${axis} policy '${design[axis]}'.`);
    if (selected.maturity === 'conceptual') {
      throw variantError('TRINITY_POLICY_NOT_IMPLEMENTED', `Policy '${design[axis]}' on ${axis} has no runtime implementation.`);
    }
    partial = mergePolicy({ selected, effects, adapters: requiredAdapters }) || partial;
  }
  return { design, maturity: partial ? 'partial' : 'implemented', executionLimits, effects, requiredAdapters };
}

function rejectUnknownAxes(input) {
  const invalid = Object.keys(input).filter((key) => !AXIS_NAMES.includes(key));
  if (invalid.length) throw variantError('TRINITY_DESIGN_AXIS_UNKNOWN', `Unknown experimental design axes: ${invalid.join(', ')}.`);
}

function mergePolicy(input) {
  const { selected, effects, adapters } = input;
  if (selected.adaptiveBudget) effects.adaptiveBudget = true;
  if (selected.requiresJury) effects.requiresJury = true;
  if (selected.requiredAdapter) adapters.push(selected.requiredAdapter);
  return selected.maturity !== 'implemented';
}

function validatePreconditions(compiled, options) {
  validateAvailableAdapters(compiled.requiredAdapters, options.availableAdapters);
  if (compiled.effects.requiresJury && !juryReady(options.trinityJury || options.jury)) {
    throw variantError('TRINITY_VARIANT_PRECONDITION_MISSING', 'Blind jury requires enabled=true, at least two distinct model URIs, and a positive maxCostUsd.');
  }
}

function validateAvailableAdapters(requiredAdapters, availableAdapters) {
  if (!Array.isArray(availableAdapters)) return;
  const missing = requiredAdapters.filter((adapter) => !availableAdapters.includes(adapter));
  if (missing.length) {
    throw variantError('TRINITY_DESIGN_ADAPTER_MISSING', `Experimental design requires unavailable adapters: ${missing.join(', ')}.`);
  }
}

function juryReady(config = {}) {
  const models = Array.isArray(config.modelUris) ? config.modelUris.filter((item) => typeof item === 'string' && item.trim()) : [];
  return config.enabled === true && new Set(models).size >= 2 && Number(config.maxCostUsd) > 0;
}

function designId(mission, design, options) {
  const basis = { mission: String(mission || '').trim(), design, budgetPolicy: options.budgetPolicy || 'runtime_equal_split' };
  const digest = crypto.createHash('sha256').update(JSON.stringify(basis)).digest('hex').slice(0, 16);
  return `trinity-design-v1-${digest}`;
}

function worldInstructions(design, index) {
  return AXIS_NAMES.map((axis) => {
    const instructions = AXES[axis][design[axis]].instructions;
    return instructions[index] || instructions[0] || null;
  }).filter(Boolean);
}

function applyToMembers(members, receipt) {
  return members.map((member, index) => ({
    ...member, variant: receipt.variant, variantSelection: receipt,
    experimentalDesignId: receipt.experimentalDesignId,
    experimentalDesign: receipt.experimentalDesign,
    mission: `${member.mission || 'Trinity mission'}\nExperimental design: ${JSON.stringify(receipt.experimentalDesign)}\nPolicies: ${worldInstructions(receipt.experimentalDesign, index).join(' ')}`
  }));
}

function designSize(design) {
  return Object.entries(design).filter(([axis, value]) => value !== DEFAULT_DESIGN[axis]).length;
}

function variantError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { AXES, AXIS_NAMES, DEFAULT_DESIGN, DEFINITIONS, selectForMission, compileExperimentalDesign, applyToMembers, adapters: trinityAdapters };
