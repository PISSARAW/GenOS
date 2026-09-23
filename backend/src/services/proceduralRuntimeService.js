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

function buildStructuralPattern(variant) {
  const ops = variant.operations || [];
  return {
    operationTypes: ops.map((o) => o.op),
    targetNodeTypes: ops.map((o) => o.target?.type).filter(Boolean),
  };
}

function recordAdaptiveRejection(variant, reason) {
  // Adaptive immune memory is ONLY for security/policy/sandbox/authority
  // violations (innate immune rejection). Fitness, causal, evidence or gate
  // rejections on quality grounds must NOT create immune memory — otherwise
  // every low-fitness operation type would become "auto-immune" forbidden.
  // The signature uses the structural matcher (operationTypes +
  // targetNodeTypes) so recall can actually match; the lexical pattern is
  // left empty to avoid over-broad substring matches.
  const ops = variant.operations || [];
  const sig = adaptive.immuneSignatureFrom({
    pattern: '',
    mutationPattern: ops.map((o) => o.op),
    structuralPattern: buildStructuralPattern(variant),
    context: {
      variantId: variant.id,
      lineageId: variant.parentId || null,
      reason: reason || 'immune-rejected',
    },
    response: { gate: 'REJECT', strength: 1.0 },
  });
  adaptiveMemory.push(sig);
}

function isImmuneGateBlock(gateResult) {
  const blocking = gateResult.blocking || [];
  return blocking.some((g) => g.name === 'immune');
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

function evaluationHashFor(receipt) {
  const crypto = require('crypto');
  const canonical = JSON.stringify({
    candidateId: receipt.candidateId || null,
    parentId: receipt.parentId || null,
    evaluatorId: receipt.evaluatorId || null,
    runnerId: receipt.runnerId || null,
    environmentId: receipt.environmentId || null,
    snapshotId: receipt.snapshotId || null,
    trials: receipt.trials,
    metrics: receipt.metrics || {},
  });
  return crypto.createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

function buildReceipt(variant, metrics, options) {
  const receipt = {
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
  receipt.evaluationHash = evaluationHashFor(receipt);
  return receipt;
}

function metricsMatchFitness(sealed, receipt) {
  const components = sealed.fitness?.components || {};
  const metrics = receipt.metrics || {};
  for (const key of Object.keys(components)) {
    if (metrics[key] == null) continue;
    const expected = Math.max(0, Math.min(1, Number(metrics[key])));
    const actual = Number(components[key]);
    if (!Number.isFinite(expected) || Math.abs(expected - actual) > 1e-9) return false;
  }
  return true;
}

function checkReceiptBinding(ctx, receipt, errors) {
  if (receipt.parentId !== ctx.parent?.metadata?.id) {
    errors.push(`receipt parent mismatch: ${receipt.parentId} != ${ctx.parent?.metadata?.id}`);
  }
  if (receipt.candidateId !== ctx.variant?.id) {
    errors.push(`receipt candidate mismatch: ${receipt.candidateId} != ${ctx.variant?.id}`);
  }
  if (!receipt.evaluatorId && !receipt.runnerId) {
    errors.push('receipt has neither evaluatorId nor runnerId');
  }
}

function checkReceiptTrials(receipt, errors) {
  if (!Number.isFinite(Number(receipt.trials)) || Number(receipt.trials) < 1) {
    errors.push(`receipt trials invalid: ${receipt.trials}`);
  }
}

function checkReceiptIntegrity(ctx) {
  const sealed = ctx.sealed || {};
  const receipt = sealed.evaluationReceipt;
  if (!receipt) return { valid: false, errors: ['evaluation receipt missing'] };
  const errors = [];
  checkReceiptBinding(ctx, receipt, errors);
  checkReceiptTrials(receipt, errors);
  if (!metricsMatchFitness(sealed, receipt)) {
    errors.push('receipt metrics do not match sealed fitness components');
  }
  if (receipt.evaluationHash !== evaluationHashFor(receipt)) {
    errors.push('receipt evaluationHash mismatch: receipt was tampered or misbound');
  }
  return { valid: errors.length === 0, errors };
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
  const integrity = checkReceiptIntegrity({ sealed, variant: ctx.variant, parent: ctx.parent });
  if (!integrity.valid) {
    return { stage: 'evaluation', rejected: true, sealed, reason: `receipt integrity refused: ${integrity.errors.join('; ')}` };
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
  if (!gateResult.promoted && isImmuneGateBlock(gateResult)) {
    recordAdaptiveRejection(ctx.variant, 'gate-immune');
  }
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
  checkReceiptIntegrity,
  evaluationHashFor,
  buildStructuralPattern,
};
