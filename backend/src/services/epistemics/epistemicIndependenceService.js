'use strict';

/**
 * Epistemic Independence Service — independence graph and verifier selection.
 *
 * Computes which agents are independent/correlated, checks whether a verifier
 * is truly independent for a given claim, and suggests the best independent
 * verifier for a problem domain.
 */

const {
  assessIndependence
} = require('../typedEvidenceAlgebraService');
const {
  listVerifiers,
  isTrusted,
  resolveVerifierDigest
} = require('../verifierTrustRegistry');
const {
  VERIFIER_KINDS,
  defaultCatalog,
  epitopeHint,
  clonalRank
} = require('../epistemic/verifierCatalogService');
const { getState } = require('./epistemicStateService');

// ---------------------------------------------------------------------------
// Independence graph
// ---------------------------------------------------------------------------

function computeAgentSignature(state) {
  const claims = state.claims || [];
  const sources = new Set();
  const types = new Set();
  const methods = new Set();
  for (const c of claims) {
    if (c.provenance?.origin) sources.add(c.provenance.origin);
    if (c.type) types.add(c.type);
    if (c.provenance?.method) methods.add(c.provenance.method);
  }
  return {
    agentId: state.agentId,
    sources: [...sources],
    types: [...types],
    methods: [...methods],
    claimCount: claims.length
  };
}

function compareSignatures(sigA, sigB) {
  const sharedSources = sigA.sources.filter((s) => sigB.sources.includes(s));
  const sharedTypes = sigA.types.filter((t) => sigB.types.includes(t));
  const sharedMethods = sigA.methods.filter((m) => sigB.methods.includes(m));

  const totalSources = new Set([...sigA.sources, ...sigB.sources]).size;
  const totalTypes = new Set([...sigA.types, ...sigB.types]).size;
  const totalMethods = new Set([...sigA.methods, ...sigB.methods]).size;

  const sourceOverlap = totalSources > 0 ? sharedSources.length / totalSources : 0;
  const typeOverlap = totalTypes > 0 ? sharedTypes.length / totalTypes : 0;
  const methodOverlap = totalMethods > 0 ? sharedMethods.length / totalMethods : 0;

  const independenceScore = 1 - Number(((sourceOverlap + typeOverlap + methodOverlap) / 3).toFixed(3));

  return {
    agentA: sigA.agentId,
    agentB: sigB.agentId,
    sharedSources,
    sharedTypes,
    sharedMethods,
    sourceOverlap: Number(sourceOverlap.toFixed(3)),
    typeOverlap: Number(typeOverlap.toFixed(3)),
    methodOverlap: Number(methodOverlap.toFixed(3)),
    independenceScore: Number(independenceScore.toFixed(3)),
    status: independenceScore > 0.7 ? 'independent' : independenceScore > 0.4 ? 'partially_independent' : 'correlated'
  };
}

function computeIndependenceGraph(agentIds) {
  if (!Array.isArray(agentIds) || agentIds.length < 2) {
    return { nodes: [], edges: [], summary: { independent: 0, correlated: 0, partially_independent: 0 } };
  }

  const signatures = agentIds.map((id) => {
    const state = getState(id);
    return state ? computeAgentSignature(state) : { agentId: id, sources: [], types: [], methods: [], claimCount: 0 };
  });

  const edges = [];
  const summary = { independent: 0, correlated: 0, partially_independent: 0 };

  for (let i = 0; i < signatures.length; i++) {
    for (let j = i + 1; j < signatures.length; j++) {
      const comparison = compareSignatures(signatures[i], signatures[j]);
      edges.push(comparison);
      summary[comparison.status] = (summary[comparison.status] || 0) + 1;
    }
  }

  return {
    nodes: signatures.map((s) => ({ agentId: s.agentId, claimCount: s.claimCount, sources: s.sources.length })),
    edges,
    summary,
    computedAt: new Date().toISOString()
  };
}

// ---------------------------------------------------------------------------
// Verifier independence
// ---------------------------------------------------------------------------

function checkVerifierIndependence(verifierId, claimId) {
  if (!verifierId) return { independent: false, reason: 'verifierId required' };
  if (!claimId) return { independent: false, reason: 'claimId required' };

  const verifier = listVerifiers().find((v) => v.id === verifierId || v.type === verifierId);
  if (!verifier) {
    return { independent: false, reason: `Unknown verifier: ${verifierId}` };
  }

  const digest = resolveVerifierDigest(verifier);
  const trusted = isTrusted(digest);

  const selfVerification = verifierId === claimId || verifier.type === claimId;

  return {
    independent: !selfVerification && trusted,
    verifierId,
    claimId,
    trusted,
    selfVerification,
    digest,
    reason: selfVerification ? 'Verifier cannot verify its own claim' : !trusted ? 'Verifier digest not in trust registry' : 'Verifier is independent and trusted'
  };
}

// ---------------------------------------------------------------------------
// Independent verifier suggestion
// ---------------------------------------------------------------------------

function suggestIndependentVerifier(agentId, problemDomain) {
  if (!agentId) return { suggestion: null, reason: 'agentId required' };

  const state = getState(agentId);
  if (!state) return { suggestion: null, reason: `No epistemic state for agent: ${agentId}` };

  const catalog = defaultCatalog();
  const claims = state.claims || [];

  const evidenceKinds = claims.map((c) => c.evidence?.[0]?.kind).filter(Boolean);
  const domainHint = problemDomain ? epitopeHint({ epitopes: { evidence: { kind: problemDomain } } }) : null;

  const ranked = clonalRank(catalog, { epitopes: { evidence: { kind: domainHint || evidenceKinds[0] || 'observation' } } });

  const agentSources = new Set(claims.map((c) => c.provenance?.origin).filter(Boolean));

  const candidates = [];
  for (const entry of ranked) {
    const verifier = entry.verifier;
    const independence = checkVerifierIndependence(verifier.type, agentId);
    const sourceOverlap = agentSources.has(verifier.type) ? 0.3 : 0;
    const score = Number((entry.fit * (independence.independent ? 1 : 0.5) * (1 - sourceOverlap)).toFixed(3));
    candidates.push({
      verifierType: verifier.type,
      score,
      independent: independence.independent,
      fit: Number(entry.fit.toFixed(3)),
      affinity: Number(verifier.affinity.toFixed(3)),
      strategy: verifier.strategy
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  if (!best || best.score < 0.1) {
    return { suggestion: null, reason: 'No sufficiently independent verifier found', candidates };
  }

  return {
    suggestion: {
      verifierType: best.verifierType,
      score: best.score,
      independent: best.independent,
      strategy: best.strategy,
      reason: best.independent
        ? `Verifier ${best.verifierType} is independent and has highest fit for this domain`
        : `Best available verifier ${best.verifierType} (independence compromised)`
    },
    alternatives: candidates.slice(1, 4).map((c) => ({ verifierType: c.verifierType, score: c.score, independent: c.independent })),
    computedAt: new Date().toISOString()
  };
}

module.exports = {
  computeIndependenceGraph,
  checkVerifierIndependence,
  suggestIndependentVerifier,
  compareSignatures
};
