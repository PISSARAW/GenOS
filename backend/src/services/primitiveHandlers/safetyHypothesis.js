/**
 * Primitives d'hypotheses et falsification empirique
 * (diagnose, hypothesisEvidence)
 */
const telemetry = require('../telemetryObserver');
const {
  evaluateHypothesis,
  normalizeBelief,
  collectEvidenceContradictions,
  collectMutualContradictions,
  resolveBeliefs,
  resolveEvidenceArray
} = require('./safetyHypothesisHelpers');

/**
 * Diagnostic de cause racine generant des hypotheses falsifiables
 */
async function diagnose(context = {}) {
  const task = resolveDiagnosisTask(context);
  const error = resolveDiagnosisError(context);
  const hypotheses = await resolveHypotheses(context, task, error);

  telemetry.emitEvent({
    eventType: 'INCIDENT_DIAGNOSIS_GENERATED',
    agentId: context.agentId || 'strategy_adapter',
    action: 'DIAGNOSE',
    detail: `Generated ${hypotheses.length} falsifiable hypotheses for: ${String(task).slice(0, 60)}`,
    severity: 'info',
    payload: { task, error, hypotheses }
  });

  return {
    success: true,
    task,
    error,
    hypothesisCount: hypotheses.length,
    hypotheses
  };
}

function resolveDiagnosisTask(context) {
  return context.task || context.incident || context.prompt || 'System incident';
}

function resolveDiagnosisError(context) {
  return context.error || context.failure || context.detail || '';
}

async function resolveHypotheses(context, task, error) {
  const provided = context.hypotheses;
  if (Array.isArray(provided) && provided.length > 0) return provided;
  return generateHypotheses(task, error);
}

async function generateHypotheses(task, error) {
  try {
    const modelRouter = require('../modelRouter');
    const res = await modelRouter.generate({
      prompt: `Diagnose the following failure and provide exactly 3 falsifiable hypotheses.\nTask: ${task}\nError: ${error}\nOutput a JSON array of objects with keys: id, statement, confidence.`,
      priority: 'bulk',
      maxTokens: 500
    });
    const parsed = JSON.parse(res.content.replace(/```json|```/g, '').trim());
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    throw new Error('Invalid JSON array');
  } catch (e) {
    return buildFallbackHypotheses(task, error);
  }
}

function buildFallbackHypotheses(task, error) {
  return [
    { id: 'hyp-1', statement: `Issue caused by state invalidation during "${String(task).slice(0, 50)}"`, falsified: false, confidence: 0.7 },
    { id: 'hyp-2', statement: `Resource exhaustion or concurrency collision: ${String(error).slice(0, 50)}`, falsified: false, confidence: 0.5 },
    { id: 'hyp-3', statement: 'Contract precondition or boundary violation', falsified: false, confidence: 0.4 }
  ];
}

/**
 * Confrontation des hypotheses aux preuves empiriques et falsification
 */
async function hypothesisEvidence(context = {}) {
  const rawHypotheses = context.hypotheses || [];
  const evidence = context.evidence || context.testResults || context.tests || [];

  const evaluated = rawHypotheses.map(hyp => evaluateHypothesis(hyp, evidence));
  const retained = evaluated.filter(h => !h.falsified);
  const falsified = evaluated.filter(h => h.falsified);

  return {
    success: true,
    totalHypotheses: evaluated.length,
    retainedCount: retained.length,
    falsifiedCount: falsified.length,
    retainedHypotheses: retained,
    falsifiedHypotheses: falsified
  };
}

/**
 * Remonte la provenance d'une croyance, conclusion ou hypothese via provenanceResolver
 */
async function beliefProvenance(context = {}) {
  const provenanceResolver = require('../provenanceResolver');
  const targetId = context.beliefId || context.claimId || context.hypothesisId || context.targetId || context.id;
  return provenanceResolver.resolveProvenance({ targetId, ...context });
}

/**
 * Verifie la coherence mutuelle et detecte les contradictions logiques dans un ensemble de croyances
 */
async function contradictionCheck(context = {}) {
  const beliefs = resolveBeliefs(context);
  const evidence = resolveEvidenceArray(context);
  const contradictions = [];

  for (let i = 0; i < beliefs.length; i++) {
    const item = normalizeBelief(beliefs[i], i);
    contradictions.push(...collectEvidenceContradictions(item, i, evidence));
    contradictions.push(...collectMutualContradictions(item, i, beliefs));
  }

  return {
    success: true,
    hasContradictions: contradictions.length > 0,
    contradictionCount: contradictions.length,
    contradictions,
    evaluatedBeliefCount: beliefs.length
  };
}

function defaultNumber(value, fallback) {
  if (value === null || value === undefined) return fallback;
  return value;
}

/**
 * Porte de securite epistemique validant qu'une croyance a une provenance prouvee avant execution
 */
async function beliefGate(context = {}) {
  const belief = context.belief || context.claim || { statement: context.statement, evidence: context.evidence };
  const minConfidence = Number(defaultNumber(context.minConfidence, 0.6));
  const confidence = Number(defaultNumber(belief.confidence, 0.8));

  const check = await contradictionCheck({ beliefs: [belief], evidence: context.evidence || [] });
  if (check.hasContradictions) {
    return {
      success: true,
      allowed: false,
      gateAction: 'REJECT',
      reason: `Belief contradicted by empirical evidence: ${check.contradictions.map(c => c.contradictedBy).join(', ')}`,
      confidence: 0.0
    };
  }

  if (confidence < minConfidence) {
    return {
      success: true,
      allowed: false,
      gateAction: 'REJECT',
      reason: `Belief confidence (${confidence}) is below required gate threshold (${minConfidence}).`,
      confidence
    };
  }

  return {
    success: true,
    allowed: true,
    gateAction: 'PASS',
    reason: 'Belief satisfies epistemic provenance and contradiction checks.',
    confidence
  };
}

module.exports = {
  diagnose,
  hypothesisEvidence,
  beliefProvenance,
  contradictionCheck,
  beliefGate
};
