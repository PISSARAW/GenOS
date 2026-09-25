'use strict';

const crypto = require('crypto');

const AXES = Object.freeze({
  worldTopology: {
    fixed_three: policy('implemented'),
    factorial_grid: policy('conceptual')
  },
  hypothesisPolicy: {
    fixed_triplet: policy('implemented', ['Keep the assigned hypothesis fixed for this world.']),
    counterfactual_dimensions: policy('partial', [
      'Use the supplied mission as the baseline premise; separate conclusions from facts.',
      'State one plausible favorable alternative premise; label its conclusions as conditional.',
      'State one plausible adverse alternative premise; label its conclusions as conditional.'
    ]),
    novelty_seeking: policy('partial', [
      'Try a direct, low-assumption approach and report novelty separately from verified quality.',
      'Try a structurally different approach and report novelty separately from verified quality.',
      'Try a counterintuitive approach and report novelty separately from verified quality.'
    ]),
    recursive_decomposition: policy('conceptual'),
    oracle_prediction: policy('conceptual')
  },
  diversityPolicy: {
    strategy_controlled: policy('implemented', ['Use the assigned strategy; do not borrow from another world.']),
    heterogeneous: policy('partial', [
      'Use an independent direct method; report provider, tools, lineage, and error diversity only when measured.',
      'Use a structured method distinct from the direct world; report diversity only when measured.',
      'Use a falsification method distinct from the other worlds; report diversity only when measured.'
    ])
  },
  interactionPolicy: {
    sealed: policy('implemented'),
    adversarial_review_prep: policy('partial', [
      'State falsifiable claims and identify how they could be challenged after the sealed phase.',
      'Define independent checks that could adjudicate conflicting claims after the sealed phase.',
      'Prepare reproducible counterexample checks; sealed worlds cannot inspect peer outputs.'
    ])
  },
  objectivePolicy: {
    shared_evidence_vector: policy('implemented'),
    pareto_orthogonal: policy('partial', [
      'Prioritize correctness and coverage.',
      'Prioritize latency and reproducibility.',
      'Prioritize cost and risk reduction.'
    ])
  },
  temporalPolicy: {
    single_horizon: policy('implemented'),
    short_medium_long: policy('partial', [
      'Analyze immediate effects.',
      'Balance near-term execution and integration.',
      'Analyze long-term maintenance and failure risks.'
    ])
  },
  replicationPolicy: {
    fixed_three: policy('implemented'),
    adaptive_budget_fixed_replicas: policy('partial', [
      'Report progress, remaining budget, and a bounded request for more effort; replica count remains fixed at three.'
    ], { adaptiveBudget: true, requiredAdapter: 'adaptive_budget_scheduler' }),
    adaptive_replica_count: policy('conceptual')
  },
  adjudicationPolicy: {
    evidence_gated: policy('implemented'),
    blind_jury_advisory: policy('partial', [
      'Provide anonymizable claims and evidence; jury advice cannot override evidence gates or deterministic decisions.'
    ], { requiresJury: true, requiredAdapter: 'blind_jury_adjudicator' })
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
  controlled: variant(/baseline|controlled|reproducible|contrôlé|reproductible/i, {}),
  heterogeneous: variant(/divers|heterogeneous|monoculture|providers|fournisseurs/i, { diversityPolicy: 'heterogeneous' }),
  adversarial: variant(/security|sécurité|attack|attaque|threat|menace|falsif|robust/i, { interactionPolicy: 'adversarial_review_prep' }),
  counterfactual: variant(/counterfactual|contrefactuel|sensitivity|sensibilité|what if|et si/i, { hypothesisPolicy: 'counterfactual_dimensions' }),
  factorial: variant(/factorial|factoriel|causal|attribution|ablation/i, { worldTopology: 'factorial_grid' }),
  pareto: variant(/pareto|multi.objective|multi.objectif|cost|coût|latency|latence/i, { objectivePolicy: 'pareto_orthogonal' }),
  jury: variant(/jury|blind|aveugle|impartial|anonymous|anonyme/i, { adjudicationPolicy: 'blind_jury_advisory' }),
  recursive: variant(/recursive|récurs|subproblem|sous.problème|decompos/i, { hypothesisPolicy: 'recursive_decomposition' }),
  adaptive: variant(/adaptive|adaptatif|dynamic budget|budget dynamique|resource allocation/i, { replicationPolicy: 'adaptive_budget_fixed_replicas' }),
  temporal: variant(/urgent|deadline|long.term|long terme|horizon|temporal/i, { temporalPolicy: 'short_medium_long' }),
  oracular: variant(/oracle|oracular|meta.reason|méta.raison|predict.*winner/i, { hypothesisPolicy: 'oracle_prediction' }),
  exploratory: variant(/creative|créatif|open.ended|problème ouvert|novel|nouveau|brainstorm|explor/i, { hypothesisPolicy: 'novelty_seeking' })
});

const PRIORITY = Object.freeze([
  'adversarial', 'pareto', 'temporal', 'exploratory', 'counterfactual', 'factorial',
  'recursive', 'jury', 'adaptive', 'heterogeneous', 'oracular', 'controlled'
]);

const POLICY_LIMITS = Object.freeze({
  hypothesisPolicy: {
    counterfactual_dimensions: ['No snapshot intervention or causal attribution is executed.'],
    novelty_seeking: ['No novelty archive, distance measure, or quality-diversity search runs.']
  },
  diversityPolicy: { heterogeneous: ['Provider, tool, lineage, and historical error diversity are not guaranteed.'] },
  interactionPolicy: { adversarial_review_prep: ['No world can inspect or attack a peer dossier during the sealed phase.'] },
  objectivePolicy: { pareto_orthogonal: ['Objectives are prompt guidance; the comparator evaluates the shared evidence vector.'] },
  temporalPolicy: { short_medium_long: ['Horizons are prompt guidance; no delayed execution or temporal-value model runs.'] },
  replicationPolicy: { adaptive_budget_fixed_replicas: ['Budget may adapt, but replica count and minimum diversity stay fixed.'] },
  adjudicationPolicy: { blind_jury_advisory: ['Jury advice is conditional on Pareto eligibility and cannot override evidence gates.'] }
});

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
    partial = mergePolicy({ axis, key: design[axis], selected, limits: executionLimits, effects, adapters: requiredAdapters }) || partial;
  }
  if (design.worldTopology !== 'fixed_three') {
    throw variantError('TRINITY_POLICY_NOT_IMPLEMENTED', `World topology '${design.worldTopology}' is not executable.`);
  }
  return { design, maturity: partial ? 'partial' : 'implemented', executionLimits, effects, requiredAdapters };
}

function rejectUnknownAxes(input) {
  const invalid = Object.keys(input).filter((key) => !AXIS_NAMES.includes(key));
  if (invalid.length) throw variantError('TRINITY_DESIGN_AXIS_UNKNOWN', `Unknown experimental design axes: ${invalid.join(', ')}.`);
}

function mergePolicy(input) {
  const { axis, key, selected, limits, effects, adapters } = input;
  if (selected.maturity !== 'implemented') limits.push(...(POLICY_LIMITS[axis]?.[key] || []));
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

module.exports = { AXES, AXIS_NAMES, DEFAULT_DESIGN, DEFINITIONS, selectForMission, compileExperimentalDesign, applyToMembers };
