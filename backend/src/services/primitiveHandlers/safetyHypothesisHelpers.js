/**
 * Helpers d'evaluation des hypotheses et des contradictions empiriques
 */
const HEALTHY_HYPOTHESIS_MARKERS = ['passed', 'no error', 'success', 'healthy', 'clean', 'invariant holds', 'valid'];
const HEALTHY_EVIDENCE_MARKERS = ['passed', 'no error', '0 error', 'success', 'healthy', 'clean'];
const STOP_WORDS = ['issue', 'caused', 'error', 'failed', 'during', 'success', 'passed', 'healthy', 'clean', 'valid', 'invariant'];

function resolveEvidenceText(e) {
  const raw = e.statement || e.detail || e.output || e.description || (typeof e === 'string' ? e : '');
  return String(raw).toLowerCase();
}

function hasCounterexample(e) {
  return Boolean(e.counterexample) || e.isCounterexample === true || e.category === 'counterexample';
}

function counterexampleTarget(e) {
  return typeof e.counterexample === 'object' ? (e.counterexample.targetHypothesis || e.counterexample.refutes) : null;
}

function matchesTarget(target, item) {
  return Boolean(target) && (target === item.id || target === item.statement);
}

function matchesExplicitTarget(item, e) {
  const explicitTarget = e.falsifies || e.refutes || e.provesNot || e.targetHypothesisId;
  return Boolean(explicitTarget) && (explicitTarget === item.id || explicitTarget === item.statement);
}

function isHypothesisHealthy(hypText) {
  return HEALTHY_HYPOTHESIS_MARKERS.some(marker => hypText.includes(marker));
}

function evidenceConfirmsHealthy(text) {
  return HEALTHY_EVIDENCE_MARKERS.some(marker => text.includes(marker));
}

function isComponentMentioned(hypText, text) {
  const words = hypText.split(/\s+/).filter(w => w.length > 3 && !STOP_WORDS.includes(w));
  return words.length === 0 || words.some(w => text.includes(w));
}

function evidenceConfirmsFailure(text, hasCounter) {
  const hasFailureKeyword = text.includes('failed') || text.includes('failure') || text.includes('exception') ||
    text.includes('panic') || text.includes('assertion violation') ||
    (text.includes('error') && !text.includes('0 error') && !text.includes('no error'));
  return hasFailureKeyword || hasCounter;
}

function semanticContradiction(flags) {
  if (!flags.mentionsComponent) return false;
  if (!flags.hypHealthy) return flags.confirmsHealthy && !flags.confirmsFailure;
  return flags.confirmsFailure;
}

function evaluatesContradiction(item, evidenceItem) {
  const e = evidenceItem;
  const hypText = (item.statement || '').toLowerCase();
  const text = resolveEvidenceText(e);
  if (matchesExplicitTarget(item, e)) return true;
  const hasCounter = hasCounterexample(e);
  if (hasCounter && matchesTarget(counterexampleTarget(e), item)) return true;
  return semanticContradiction({
    mentionsComponent: isComponentMentioned(hypText, text),
    hypHealthy: isHypothesisHealthy(hypText),
    confirmsHealthy: evidenceConfirmsHealthy(text),
    confirmsFailure: evidenceConfirmsFailure(text, hasCounter)
  });
}

function normalizeHypothesis(hyp) {
  if (typeof hyp !== 'string') return { ...hyp };
  return {
    id: 'hyp_' + Math.random().toString(36).slice(2, 8),
    statement: hyp,
    confidence: 0.5
  };
}

function getExistingRefutations(item) {
  return Array.isArray(item.refutedBy) ? item.refutedBy : [];
}

function collectRefutations(evidenceItems) {
  return evidenceItems.map(e => e.id || e.statement || e.counterexample || e);
}

function collectCounterexamples(evidenceItems) {
  return evidenceItems.filter(e => e.counterexample || e.isCounterexample).map(e => e.counterexample || e);
}

function buildEvaluatedHypothesis(item, refutingEvidences) {
  const contradicts = refutingEvidences.length > 0;
  const isFalsified = item.falsified === true || contradicts;
  const existing = getExistingRefutations(item);
  const newRefutations = collectRefutations(refutingEvidences);
  return {
    ...item,
    falsified: isFalsified,
    confidence: isFalsified ? 0.0 : (item.confidence || 0.6),
    refutedBy: isFalsified ? [...new Set([...existing, ...newRefutations])] : existing,
    counterexamples: collectCounterexamples(refutingEvidences)
  };
}

function evaluateHypothesis(hyp, evidence) {
  const item = normalizeHypothesis(hyp);
  const refutingEvidences = evidence.filter(e => evaluatesContradiction(item, e));
  return buildEvaluatedHypothesis(item, refutingEvidences);
}

function normalizeBelief(belief, index) {
  if (typeof belief !== 'string') return belief;
  return { id: 'b_' + index, statement: belief };
}

function collectEvidenceContradictions(item, index, evidence) {
  const found = [];
  for (const e of evidence) {
    if (evaluatesContradiction(item, e)) {
      found.push({
        type: 'evidence_contradiction',
        beliefId: item.id || 'b_' + index,
        statement: item.statement,
        contradictedBy: e.id || e.statement || e
      });
    }
  }
  return found;
}

function hasDirectOpposition(itemText, otherText) {
  const passedFailed = itemText.includes('passed') && otherText.includes('failed');
  const successError = itemText.includes('success') && otherText.includes('error');
  const cleanCorrupted = itemText.includes('clean') && otherText.includes('corrupted');
  return passedFailed || successError || cleanCorrupted;
}

function collectMutualContradictions(item, index, beliefs) {
  const found = [];
  const itemText = String(item.statement || '').toLowerCase();
  for (let j = index + 1; j < beliefs.length; j++) {
    const other = normalizeBelief(beliefs[j], j);
    const otherText = String(other.statement || '').toLowerCase();
    if (hasDirectOpposition(itemText, otherText)) {
      found.push({
        type: 'mutual_contradiction',
        beliefA: item.id || 'b_' + index,
        beliefB: other.id || 'b_' + j,
        statementA: item.statement,
        statementB: other.statement
      });
    }
  }
  return found;
}

function resolveBeliefs(context) {
  if (Array.isArray(context.beliefs)) return context.beliefs;
  return context.claims || context.hypotheses || [];
}

function resolveEvidenceArray(context) {
  return Array.isArray(context.evidence) ? context.evidence : [];
}

module.exports = {
  evaluatesContradiction,
  evaluateHypothesis,
  normalizeBelief,
  collectEvidenceContradictions,
  collectMutualContradictions,
  resolveBeliefs,
  resolveEvidenceArray
};
