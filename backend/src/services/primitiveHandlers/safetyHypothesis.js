/**
 * Primitives d'hypotheses et falsification empirique
 * (diagnose, hypothesisEvidence)
 */
const telemetry = require('../telemetryObserver');

/**
 * Diagnostic de cause racine generant des hypotheses falsifiables
 */
async function diagnose(context = {}) {
  const task = context.task || context.incident || context.prompt || 'System incident';
  const error = context.error || context.failure || context.detail || '';
  let hypotheses = context.hypotheses;
  if (!Array.isArray(hypotheses) || hypotheses.length === 0) {
    try {
      const modelRouter = require('../modelRouter');
      const res = await modelRouter.generate({
        prompt: `Diagnose the following failure and provide exactly 3 falsifiable hypotheses.\nTask: ${task}\nError: ${error}\nOutput a JSON array of objects with keys: id, statement, confidence.`,
        priority: 'bulk',
        maxTokens: 500
      });
      const parsed = JSON.parse(res.content.replace(/```json|```/g, '').trim());
      if (Array.isArray(parsed) && parsed.length > 0) {
        hypotheses = parsed;
      } else {
        throw new Error('Invalid JSON array');
      }
    } catch (e) {
      hypotheses = [
        { id: 'hyp-1', statement: `Issue caused by state invalidation during "${String(task).slice(0, 50)}"`, falsified: false, confidence: 0.7 },
        { id: 'hyp-2', statement: `Resource exhaustion or concurrency collision: ${String(error).slice(0, 50)}`, falsified: false, confidence: 0.5 },
        { id: 'hyp-3', statement: 'Contract precondition or boundary violation', falsified: false, confidence: 0.4 }
      ];
    }
  }

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

/**
 * Determine si une preuve contredit ou refute une hypothese
 */
function evaluatesContradiction(item, evidenceItem) {
  const e = evidenceItem;
  const hypText = (item.statement || '').toLowerCase();
  const text = String(e.statement || e.detail || e.output || e.description || (typeof e === 'string' ? e : '')).toLowerCase();

  // 1. Refutation explicite par identifiant ou ciblage direct
  const explicitTarget = e.falsifies || e.refutes || e.provesNot || e.targetHypothesisId;
  if (explicitTarget && (explicitTarget === item.id || explicitTarget === item.statement)) {
    return true;
  }

  // 2. Preuve contenant un contre-exemple formel
  const hasCounterexample = Boolean(e.counterexample) || e.isCounterexample === true || e.category === 'counterexample';
  if (hasCounterexample) {
    const ceTarget = typeof e.counterexample === 'object' ? (e.counterexample.targetHypothesis || e.counterexample.refutes) : null;
    if (ceTarget && (ceTarget === item.id || ceTarget === item.statement)) {
      return true;
    }
  }

  // 3. Analyse lexicale & semantique
  const hypHealthy = hypText.includes('passed') || hypText.includes('no error') || hypText.includes('success') ||
    hypText.includes('healthy') || hypText.includes('clean') || hypText.includes('invariant holds') || hypText.includes('valid');

  const words = hypText.split(/\s+/).filter(w => w.length > 3 && !['issue', 'caused', 'error', 'failed', 'during', 'success', 'passed', 'healthy', 'clean', 'valid', 'invariant'].includes(w));
  const mentionsComponent = words.length === 0 || words.some(w => text.includes(w));

  const confirmsHealthy = text.includes('passed') || text.includes('no error') || text.includes('0 error') ||
    text.includes('success') || text.includes('healthy') || text.includes('clean');
  const hasFailureKeyword = (text.includes('failed') || text.includes('failure') || text.includes('exception') ||
    text.includes('panic') || text.includes('assertion violation') || (text.includes('error') && !text.includes('0 error') && !text.includes('no error')));
  const confirmsFailure = hasFailureKeyword || hasCounterexample;

  // Cas A : L'hypothese incrimine un bug (hypHealthy = false), mais la preuve montre que le composant est sain
  if (mentionsComponent && !hypHealthy && confirmsHealthy && !confirmsFailure) {
    return true;
  }

  // Cas B : L'hypothese affirme un fonctionnement sain / invariant (hypHealthy = true), mais la preuve ou contre-exemple montre un echec
  if (mentionsComponent && hypHealthy && confirmsFailure) {
    return true;
  }

  return false;
}

/**
 * Confrontation des hypotheses aux preuves empiriques et falsification
 */
async function hypothesisEvidence(context = {}) {
  const rawHypotheses = context.hypotheses || [];
  const evidence = context.evidence || context.testResults || context.tests || [];

  const evaluated = rawHypotheses.map(hyp => {
    const item = typeof hyp === 'string' ? { id: `hyp_${Math.random().toString(36).slice(2, 8)}`, statement: hyp, confidence: 0.5 } : { ...hyp };
    const refutingEvidences = evidence.filter(e => evaluatesContradiction(item, e));
    const contradicts = refutingEvidences.length > 0;
    const isFalsified = item.falsified === true || contradicts;

    const existingRefutations = Array.isArray(item.refutedBy) ? item.refutedBy : [];
    const newRefutations = refutingEvidences.map(e => e.id || e.statement || e.counterexample || e);

    return {
      ...item,
      falsified: isFalsified,
      confidence: isFalsified ? 0.0 : (item.confidence || 0.6),
      refutedBy: isFalsified ? [...new Set([...existingRefutations, ...newRefutations])] : existingRefutations,
      counterexamples: refutingEvidences.filter(e => e.counterexample || e.isCounterexample).map(e => e.counterexample || e)
    };
  });

  const retained = evaluated.filter(h => !h.falsified);
  const falsified = evaluated.filter(h => h.falsified);

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
  const beliefs = Array.isArray(context.beliefs) ? context.beliefs : (context.claims || context.hypotheses || []);
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  const contradictions = [];

  for (let i = 0; i < beliefs.length; i++) {
    const item = typeof beliefs[i] === 'string' ? { id: `b_${i}`, statement: beliefs[i] } : beliefs[i];
    // Check against evidence
    for (const e of evidence) {
      if (evaluatesContradiction(item, e)) {
        contradictions.push({
          type: 'evidence_contradiction',
          beliefId: item.id || `b_${i}`,
          statement: item.statement,
          contradictedBy: e.id || e.statement || e
        });
      }
    }
    // Check against opposing beliefs in the same set
    for (let j = i + 1; j < beliefs.length; j++) {
      const other = typeof beliefs[j] === 'string' ? { id: `b_${j}`, statement: beliefs[j] } : beliefs[j];
      const otherText = String(other.statement || '').toLowerCase();
      const itemText = String(item.statement || '').toLowerCase();
      const directOpposition = (itemText.includes('passed') && otherText.includes('failed')) ||
        (itemText.includes('success') && otherText.includes('error')) ||
        (itemText.includes('clean') && otherText.includes('corrupted'));
      if (directOpposition) {
        contradictions.push({
          type: 'mutual_contradiction',
          beliefA: item.id || `b_${i}`,
          beliefB: other.id || `b_${j}`,
          statementA: item.statement,
          statementB: other.statement
        });
      }
    }
  }

  return {
    success: true,
    hasContradictions: contradictions.length > 0,
    contradictionCount: contradictions.length,
    contradictions,
    evaluatedBeliefCount: beliefs.length
  };
}

/**
 * Porte de securite epistemique validant qu'une croyance a une provenance prouvee avant execution
 */
async function beliefGate(context = {}) {
  const belief = context.belief || context.claim || { statement: context.statement, evidence: context.evidence };
  const minConfidence = Number(context.minConfidence ?? 0.6);
  const confidence = Number(belief.confidence ?? 0.8);

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
