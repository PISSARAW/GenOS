'use strict';

const { createHash } = require('node:crypto');
const { createFormalResult } = require('./formalResultService');
const verifierReceipts = require('./epistemicVerifierReceiptService');

const PASSED = new Set(['passed', 'verified']);
const PROVED = new Set(['proved', 'verified']);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function digest(value) {
  const text = JSON.stringify(canonicalValue(value));
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function violation(policy, message, details = {}) {
  return { policy, message, details };
}

function normalizeResults(input, violations) {
  const results = [];
  for (const item of input.results || []) {
    try {
      results.push(createFormalResult(item));
    } catch (error) {
      violations.push(violation('formal_result_integrity', error.message));
    }
  }
  return results;
}

function indexBy(items, field) {
  return new Map(items.map((item) => [item[field], item]));
}

function requiredObligationIds(input) {
  return new Set((input.obligations || []).filter((item) => item.required !== false).map((item) => item.id));
}

function coveredObligationIds(input, resultsById) {
  const covered = new Set();
  for (const edge of input.coverage || []) {
    const result = resultsById.get(edge.resultId);
    if (!result || edge.evidenceDigest !== result.evidence.digest) continue;
    covered.add(edge.obligationId);
  }
  return covered;
}

function checkObligationCoverage(input, resultsById, violations) {
  const required = requiredObligationIds(input);
  const covered = coveredObligationIds(input, resultsById);
  const missing = [...required].filter((id) => !covered.has(id));
  if (missing.length) {
    violations.push(violation('constraint_closure', 'Required obligations are not evidence-bound.', { missing }));
  }
}

function attestationKey(attestation) {
  return [...new Set(attestation.obligationIds || [])].sort().join('\u0000');
}

function checkConstraintCensus(input, violations) {
  // Chaque receipt couvre les obligations qu'il a réellement validées
  // (coveredObligations). Le census est valide si l'union des attestations
  // couvre toutes les obligations, pas si chaque acteur couvre tout.
  const attestations = (input.constraintAttestations || []).filter((item) => item.independent === true);
  const actors = new Set(attestations.map((item) => item.actorId).filter(Boolean));
  
  const covered = new Set();
  for (const att of attestations) {
    for (const oid of att.obligationIds || []) covered.add(oid);
  }
  
  const required = requiredObligationIds(input);
  const missing = [...required].filter(id => !covered.has(id));
  
  if (actors.size < 2 || missing.length > 0) {
    violations.push(violation(
      'constraint_census',
      `Census incomplet: ${actors.size} acteur(s), ${missing.length} obligation(s) manquante(s)`,
      { actors: [...actors], covered: [...covered], missing }
    ));
  }
}

function verificationMatches(receipt, context) {
  const { result, trustedVerifierDigests } = context;
  if (!receipt || !result) return false;
  if (receipt.independent !== true || !PASSED.has(receipt.status)) return false;
  if (receipt.evidenceDigest !== result.evidence.digest) return false;
  if (receipt.resultId !== result.resultId) return false;
  return verifierReceipts.validateReceipt(receipt, trustedVerifierDigests);
}

function checkIndependentVerification(input, results, violations) {
  const receipts = input.verifications || [];
  const roots = new Set(input.compositionRoots || []);
  const trustedVerifierDigests = input.trustedVerifierDigests || [];
  for (const result of results) {
    if (!roots.has(result.resultId)) continue;
    const context = { result, trustedVerifierDigests };
    if (receipts.some((receipt) => verificationMatches(receipt, context))) continue;
    violations.push(violation('proof_verification', 'A promoted root lacks an independent, evidence-bound verifier receipt.', { resultId: result.resultId }));
  }
}

function pairKey(left, right) {
  return [left, right].sort().join('\u0000');
}

function provedEquivalencePairs(input) {
  const pairs = new Set();
  for (const edge of input.equivalences || []) {
    if (!PROVED.has(edge.status) || !edge.witnessDigest) continue;
    pairs.add(pairKey(edge.left, edge.right));
  }
  return pairs;
}

function checkSemanticDeduplication(input, results, violations) {
  const equivalents = provedEquivalencePairs(input);
  for (let left = 0; left < results.length; left += 1) {
    for (let right = left + 1; right < results.length; right += 1) {
      const a = results[left];
      const b = results[right];
      const duplicate = a.semanticFingerprint === b.semanticFingerprint || equivalents.has(pairKey(a.resultId, b.resultId));
      if (!duplicate) continue;
      const coalesced = (input.deduplications || []).some((item) => item.members?.includes(a.resultId) && item.members?.includes(b.resultId));
      if (!coalesced) violations.push(violation('semantic_deduplication', 'Equivalent results were not coalesced.', { resultIds: [a.resultId, b.resultId] }));
    }
  }
}

function resolvedContradiction(input, relation) {
  return (input.contradictionResolutions || []).some((item) => {
    if (item.relationId !== relation.id) return false;
    if (!PROVED.has(item.status) || !item.witnessDigest) return false;
    return ['left', 'right', 'both_refuted', 'domain_partition'].includes(item.decision);
  });
}

function checkContradictions(input, violations) {
  for (const relation of input.relations || []) {
    if (relation.type !== 'contradicts') continue;
    if (relation.domainOverlap === 'disjoint') continue;
    if (resolvedContradiction(input, relation)) continue;
    violations.push(violation('logical_contradiction', 'An overlapping or unknown-domain contradiction is unresolved.', { relationId: relation.id }));
  }
}

function resultDependencies(result) {
  return result.dependencies.map((item) => item.resultId);
}

function visitResult(resultId, state) {
  if (state.visiting.has(resultId)) return false;
  if (state.visited.has(resultId)) return true;
  const result = state.resultsById.get(resultId);
  if (!result) return false;
  state.visiting.add(resultId);
  const valid = resultDependencies(result).every((dependency) => visitResult(dependency, state));
  state.visiting.delete(resultId);
  state.visited.add(resultId);
  return valid;
}

function checkComposition(input, resultsById, violations) {
  const roots = input.compositionRoots || [];
  if (!roots.length) {
    violations.push(violation('proof_composition', 'At least one promoted composition root is required.'));
    return;
  }
  const state = { resultsById, visiting: new Set(), visited: new Set() };
  const invalid = roots.filter((root) => !visitResult(root, state));
  if (invalid.length) violations.push(violation('proof_composition', 'Composition contains a missing dependency or a cycle.', { roots: invalid }));
}

function checkFailureApplicability(input, violations) {
  for (const reuse of input.failureReuses || []) {
    const valid = reuse.status === 'applicable' && reuse.domainFingerprint && reuse.constraintFingerprint && reuse.witnessDigest;
    if (!valid) violations.push(violation('failure_applicability', 'Negative knowledge reuse lacks a proved domain-and-constraint applicability witness.', { failureId: reuse.failureId }));
  }
}

function validContribution(entry, resultsById) {
  const cited = [...(entry.usedResultIds || []), ...(entry.rejectedResultIds || [])];
  if (!entry.workerId || !entry.decisionWitness || !cited.length) return false;
  return cited.every((id) => resultsById.has(id));
}

function checkContributions(input, resultsById, violations) {
  const expected = new Set(input.workerIds || []);
  const seen = new Set();
  for (const entry of input.contributions || []) {
    if (validContribution(entry, resultsById)) seen.add(entry.workerId);
  }
  const missing = [...expected].filter((id) => !seen.has(id));
  if (missing.length) violations.push(violation('causal_contribution', 'Worker contributions are not connected to verified result nodes.', { missing }));
}

function evaluateEpistemicAssurance(input = {}) {
  const violations = [];
  const results = normalizeResults(input, violations);
  const resultsById = indexBy(results, 'resultId');
  checkObligationCoverage(input, resultsById, violations);
  checkConstraintCensus(input, violations);
  checkIndependentVerification(input, results, violations);
  checkSemanticDeduplication(input, results, violations);
  checkContradictions(input, violations);
  checkComposition(input, resultsById, violations);
  checkFailureApplicability(input, violations);
  checkContributions(input, resultsById, violations);
  return {
    eligible: violations.length === 0,
    assemblyDigest: digest(input),
    resultIds: results.map((item) => item.resultId),
    violations,
  };
}

module.exports = { evaluateEpistemicAssurance };
