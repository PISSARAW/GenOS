'use strict';

// Procedural runtime — the pipeline that connects the existing engines:
//
//   generateVariants -> adaptive+innate immune -> causal forks ->
//   candidate-specific evaluation + receipt -> sealCandidate ->
//   semantic validation -> promotion gate -> persistGenome
//
// Invariants:
//   NO CANDIDATE-SPECIFIC EVALUATION -> NO PROMOTION.
//   All candidates are evaluated BEFORE any promotion; the promoted
//   candidate is the best-fitness survivor of paretoFront+nicheSelection.

const mutation = require('./proceduralMutationSelectionService');
const immune = require('./proceduralImmuneInspectionService');
const identity = require('./proceduralIdentityService');
const semantics = require('./proceduralGraphSemanticsService');
const gate = require('./proceduralPromotionGateService');
const persistence = require('./proceduralPersistenceService');
const causalSvc = require('./proceduralCausalValidationService');
const adaptive = require('./proceduralAdaptiveImmuneMemoryService');

const adaptiveMemory = [];

function getAdaptiveMemory() {
  return adaptiveMemory;
}

function resetAdaptiveMemory() {
  adaptiveMemory.length = 0;
}

function resolveEvaluator(options) {
  if (typeof options.fitnessMetrics === 'function') return options.fitnessMetrics;
  if (options.evaluatorId) {
    const registry = require('./proceduralRegistryService');
    return registry.resolveEvaluator(options.evaluatorId);
  }
  return null;
}

function resolveRunner(options) {
  if (typeof options.causalRunner === 'function') return options.causalRunner;
  if (options.runnerId) {
    const registry = require('./proceduralRegistryService');
    return registry.resolveRunner(options.runnerId);
  }
  return null;
}

function resolveInitialState(options) {
  if (options.initialState != null) return options.initialState;
  if (options.snapshotId) {
    const registry = require('./proceduralRegistryService');
    return registry.resolveSnapshot(options.snapshotId);
  }
  return null;
}

function inspectVariant(variant) {
  const report = immune.inspectMutation({
    id: variant.id,
    operations: variant.operations,
  });
  const recall = adaptive.recallRejection(adaptiveMemory, {
    operations: variant.operations,
    code: JSON.stringify(variant.operations || []),
  });
  const rejected = !report.safe || recall.rejected === true;
  return {
    safe: report.safe && !recall.rejected,
    findings: report.findings,
    rejected,
    adaptive: recall,
  };
}

function recordAdaptiveRejection(variant, reason) {
  const sig = adaptive.immuneSignatureFrom({
    pattern: JSON.stringify((variant.operations || []).map((o) => o.op)),
    mutationPattern: (variant.operations || []).map((o) => o.op),
    structuralPattern: null,
    context: { variantId: variant.id, reason: reason || 'rejected' },
    response: { gate: 'REJECT', strength: 1.0 },
  });
  adaptiveMemory.push(sig);
}

function receiptEvaluatorId(options) {
  if (options.evaluatorId) return options.evaluatorId;
  if (options.fitnessMetrics) return 'inline';
  return null;
}

function receiptRunnerId(options) {
  if (options.runnerId) return options.runnerId;
  if (options.causalRunner) return 'inline';
  return null;
}

function receiptTrials(options) {
  const n = Number(options.trials);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return 1;
}

function buildReceipt(variant, metrics, options) {
  return {
    candidateId: variant.id || null,
    parentId: variant.parentId || null,
    evaluatorId: receiptEvaluatorId(options),
    runnerId: receiptRunnerId(options),
    environmentId: options.environmentId || null,
    snapshotId: options.snapshotId || null,
    trials: receiptTrials(options),
    metrics: { ...(metrics || {}) },
    provenance: {
      at: new Date().toISOString(),
      causal: Boolean(options.causalRunner || options.runnerId),
    },
  };
}

function evaluateVariant(variant, options) {
  const evaluator = resolveEvaluator(options);
  const metrics = evaluator ? evaluator(variant) : null;
  if (!metrics) return null;
  const fitnessSvc = require('./proceduralFitnessService');
  const fitness = fitnessSvc.fitness(options.policy || {}, metrics);
  return { fitness, receipt: buildReceipt(variant, metrics, options) };
}

function fitnessFromCausal(causalResult, variant, options) {
  const fitnessSvc = require('./proceduralFitnessService');
  const metrics = {
    success: causalResult.comparison.candidateScore,
    evidence: causalResult.causalEvidence ? 0.9 : 0.1,
  };
  const fitness = fitnessSvc.fitness({}, metrics);
  const receipt = buildReceipt(variant, metrics, {
    ...options,
    trials: 2,
    evaluatorId: options.evaluatorId || 'causal-fork',
  });
  return { fitness, receipt };
}

function causalStage(parent, variant, options) {
  const runner = resolveRunner(options);
  if (!runner) return { skip: true };
  const initialState = resolveInitialState(options);
  if (!initialState) {
    return { rejected: true, reason: 'initialState is required for causal validation' };
  }
  const result = causalSvc.validateCausally({
    runner,
    parent,
    candidate: variant.organism,
    initialState,
  });
  if (!result.improvement) {
    return {
      rejected: true,
      causal: result,
      reason: `causal verdict: ${result.verdict} (scoreDelta=${result.scoreDelta})`,
    };
  }
  return { causal: result };
}

function sealWithEvaluation(ctx) {
  return mutation.sealCandidate(ctx.parent, ctx.variant, {
    fitness: ctx.evaluated ? ctx.evaluated.fitness : null,
    receipt: ctx.evaluated ? ctx.evaluated.receipt : null,
    immune: { rejected: false, findings: ctx.immuneResult.findings },
  });
}

function evaluateStep(ctx) {
  if (ctx.causal.causal) return fitnessFromCausal(ctx.causal.causal, ctx.variant, ctx.opts);
  return evaluateVariant(ctx.variant, ctx.opts);
}

function gateStep(ctx) {
  const sealed = sealWithEvaluation(ctx);
  if (!sealed.evaluationReceipt) {
    return { stage: 'evaluation', rejected: true, sealed, reason: 'evaluation receipt missing: promotion refused' };
  }
  const schema = identity.validateOrganism(sealed);
  if (!schema.valid) {
    return { stage: 'schema', rejected: true, sealed, reason: schema.errors.join('; ') };
  }
  const semantic = semantics.validateGraphSemantics(sealed);
  if (!semantic.valid) {
    return { stage: 'semantics', rejected: true, sealed, reason: semantic.errors.join('; ') };
  }
  const gateResult = gate.evaluatePromotionGate({
    organism: ctx.parent,
    candidate: sealed,
    policy: ctx.opts.policy || {},
  });
  if (!gateResult.promoted) recordAdaptiveRejection(ctx.variant, 'gate');
  return { stage: 'gate', rejected: !gateResult.promoted, sealed, gate: gateResult, causal: ctx.causal.causal || null };
}

function assessCandidate(parent, variant, options) {
  const ctx = { parent, variant, opts: options || {} };
  ctx.immuneResult = inspectVariant(variant);
  if (ctx.immuneResult.rejected) {
    recordAdaptiveRejection(variant, 'immune');
    return { stage: 'immune', rejected: true, immune: ctx.immuneResult, reason: 'immune inspection rejected the mutation' };
  }
  ctx.causal = causalStage(parent, variant, ctx.opts);
  if (ctx.causal.rejected) {
    recordAdaptiveRejection(variant, ctx.causal.reason);
    return { stage: 'causal', rejected: true, causal: ctx.causal.causal, reason: ctx.causal.reason };
  }
  ctx.evaluated = evaluateStep(ctx);
  if (!ctx.evaluated || !ctx.evaluated.fitness) {
    return { stage: 'evaluation', rejected: true, causal: ctx.causal.causal || null, reason: 'no candidate-specific evaluation: promotion refused' };
  }
  return gateStep(ctx);
}

function rankSurvivors(viable, options) {
  const front = mutation.paretoFront(viable, options.objectives);
  const niched = mutation.nicheSelection(front, { maxPerNiche: options.maxPerNiche });
  const ranked = [...niched].sort(compareFitness);
  return { front, niched, ranked };
}

function compareFitness(a, b) {
  const sa = Number(a?.sealed?.fitness?.score);
  const sb = Number(b?.sealed?.fitness?.score);
  const na = Number.isFinite(sa) ? sa : 0;
  const nb = Number.isFinite(sb) ? sb : 0;
  return nb - na;
}

async function runEvolutionCycle(db, parent, options = {}) {
  const variants = mutation.generateVariants(parent, options.variantCount || 5);
  const attempts = [];
  const viable = [];
  for (const variant of variants) {
    const assessment = assessCandidate(parent, variant, options);
    attempts.push({
      variantId: variant.id,
      operation: variant.operations[0] && variant.operations[0].op,
      ...assessment,
    });
    if (!assessment.rejected) {
      viable.push({ ...variant, sealed: assessment.sealed, assessment });
    }
  }
  if (!viable.length) {
    return { promoted: false, attempts, viableCount: 0, paretoCount: 0, nicheCount: 0, reason: 'no variant passed all gates' };
  }
  const ranked = rankSurvivors(viable, options);
  const winner = ranked.ranked[0];
  const saved = await persistence.persistGenome(db, winner.sealed, { status: 'active' });
  return {
    promoted: true,
    saved,
    attempts,
    viableCount: viable.length,
    paretoCount: ranked.front.length,
    nicheCount: ranked.niched.length,
    promotedId: saved.metadata.id,
  };
}

module.exports = {
  runEvolutionCycle,
  assessCandidate,
  inspectVariant,
  getAdaptiveMemory,
  resetAdaptiveMemory,
};
