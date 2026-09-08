const evolution = require('./evolution');

async function frontierEscalation(context = {}) {
  const entropy = Number(context.normalizedEntropy ?? context.entropy ?? 0);
  const threshold = Number(context.threshold ?? 0.7);
  if (!Number.isFinite(entropy) || !Number.isFinite(threshold)) return { success: false, error: 'entropy and threshold are required.', code: 'ENTROPY_REQUIRED' };
  return { success: true, escalated: entropy >= threshold, route: entropy >= threshold ? 'frontier' : 'local', entropy, threshold };
}

async function impactGraph(context = {}) {
  const nodes = Array.isArray(context.nodes) ? context.nodes : [];
  const edges = Array.isArray(context.edges) ? context.edges : [];
  const adjacency = Object.fromEntries(nodes.map((node) => [String(node.id), []]));
  for (const edge of edges) if (adjacency[edge.source]) adjacency[edge.source].push(String(edge.target));
  return { success: true, nodes: adjacency, edgeCount: edges.length };
}

async function invalidateAssumption(context = {}) {
  const assumption = String(context.assumption || context.assumptionId || '').trim();
  if (!assumption) return { success: false, error: 'assumption is required.', code: 'ASSUMPTION_REQUIRED' };
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  const invalidated = evidence.some((item) => item.refutes === assumption || item.falsifies === assumption || item.counterexample === true);
  return { success: true, assumption, invalidated, evidenceCount: evidence.length };
}

async function pairedEvaluation(context = {}) {
  const left = Number(context.leftScore ?? context.left?.score);
  const right = Number(context.rightScore ?? context.right?.score);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return { success: false, error: 'leftScore and rightScore are required.', code: 'SCORES_REQUIRED' };
  return { success: true, leftScore: left, rightScore: right, delta: right - left, equivalent: Math.abs(right - left) <= Number(context.tolerance ?? 0.01), winner: left === right ? 'tie' : left > right ? 'left' : 'right' };
}

async function heredityExperiment(context = {}) {
  const parents = Array.isArray(context.parents) ? context.parents : [];
  const child = context.child || {};
  if (!parents.length || !child) return { success: false, error: 'parents and child are required.', code: 'HEREDITY_INPUT_REQUIRED' };
  const inherited = [...new Set(parents.flatMap((parent) => Array.isArray(parent.traits) ? parent.traits : []))].filter((trait) => (child.traits || []).includes(trait));
  return { success: true, inheritedTraits: inherited, inheritanceRate: child.traits?.length ? inherited.length / child.traits.length : 0 };
}

async function branchEvolution(context = {}) { return evolution.mutate({ ...context, evolution: true }); }

async function adversarialReview(context = {}) {
  const claims = Array.isArray(context.claims) ? context.claims : [];
  const counterclaims = Array.isArray(context.counterclaims) ? context.counterclaims : [];
  if (!claims.length) return { success: false, error: 'claims are required.', code: 'CLAIMS_REQUIRED' };
  const challenged = claims.map((claim) => ({ claim, challenged: counterclaims.some((counterclaim) => String(counterclaim.targetId || counterclaim.target || '') === String(claim.id)), evidence: claim.evidence || [] }));
  return { success: true, challenged, unsupported: challenged.filter((item) => !item.evidence.length).map((item) => item.claim) };
}

async function blindCritics(context = {}) { return adversarialReview({ ...context, blind: true }); }

async function contextCompaction(context = {}) {
  const items = Array.isArray(context.items) ? context.items : Array.isArray(context.messages) ? context.messages : [];
  const limit = Math.max(1, Number(context.limit || 20));
  return { success: true, retained: items.slice(-limit), removed: Math.max(0, items.length - limit), originalCount: items.length };
}

async function experiencePackets(context = {}) { return { success: true, packets: Array.isArray(context.experiences) ? context.experiences.map((experience, index) => ({ id: String(experience.id || index + 1), experience })) : [] }; }
async function knowledgeGraph(context = {}) { return { success: true, nodes: context.nodes || [], edges: context.edges || [] }; }
async function reviewedApply(context = {}) { return { success: Boolean(context.approved === true), applied: context.approved === true, reason: context.approved === true ? 'review approved' : 'review approval required' }; }

module.exports = { frontierEscalation, impactGraph, invalidateAssumption, pairedEvaluation, heredityExperiment, branchEvolution, adversarialReview, blindCritics, contextCompaction, experiencePackets, knowledgeGraph, reviewedApply };
