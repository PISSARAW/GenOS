const evolution = require('../../agentEvolutionService');

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

async function experiencePackets(context = {}) {
  const experiences = Array.isArray(context.experiences) ? context.experiences : [];
  if (!experiences.length) return { success: false, error: 'experiences array is required.', code: 'EXPERIENCES_REQUIRED' };
  const packets = experiences.map((exp, index) => {
    const payload = typeof exp === 'object' && exp !== null ? exp : { content: exp };
    const id = String(payload.id || `pkt-${index + 1}`);
    return { id, sequence: index + 1, timestamp: payload.timestamp || new Date().toISOString(), payload };
  });
  return { success: true, packets, count: packets.length };
}

async function knowledgeGraph(context = {}) {
  const nodes = Array.isArray(context.nodes) ? context.nodes : [];
  const edges = Array.isArray(context.edges) ? context.edges : [];
  const nodeIds = new Set(nodes.map((n) => String(typeof n === 'object' && n ? n.id || n.name : n)));
  const validEdges = edges.filter((e) => e && nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)));
  return { success: true, nodes, edges: validEdges, nodeCount: nodes.length, edgeCount: validEdges.length, complete: validEdges.length === edges.length };
}

async function reviewedApply(context = {}) { return { success: Boolean(context.approved === true), applied: context.approved === true, reason: context.approved === true ? 'review approved' : 'review approval required' }; }

async function inferTraits(context = {}) {
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  const traits = [...new Set(evidence.flatMap((item) => Array.isArray(item.traits) ? item.traits : item.trait ? [item.trait] : []))];
  return { success: true, traits, evidenceCount: evidence.length };
}

async function replicate(context = {}) {
  const source = context.source || context.parent || {};
  if (!source.id) return { success: false, error: 'source.id is required.', code: 'SOURCE_REQUIRED' };
  return { success: true, replica: { ...source, id: String(context.replicaId || `${source.id}-replica`), replicatedFrom: source.id, traits: [...(source.traits || [])] } };
}

async function promoteTrait(context = {}) {
  const trait = String(context.trait || '').trim();
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  if (!trait || !evidence.length) return { success: false, error: 'trait and evidence are required.', code: 'TRAIT_EVIDENCE_REQUIRED' };
  return { success: true, promoted: true, trait, evidenceCount: evidence.length };
}

async function phenotypeEvidence(context = {}) {
  const phenotype = context.phenotype || {};
  const evidence = Array.isArray(context.evidence) ? context.evidence : [];
  return { success: true, phenotype, evidence, supported: evidence.length > 0 };
}

async function validateChild(context = {}) {
  const child = context.child || {};
  const requiredTraits = Array.isArray(context.requiredTraits) ? context.requiredTraits : [];
  const traits = new Set(child.traits || []);
  const missing = requiredTraits.filter((trait) => !traits.has(trait));
  return { success: missing.length === 0, valid: missing.length === 0, missingTraits: missing };
}

async function alternateGenome(context = {}) {
  const genome = context.genome || {};
  return { success: true, genome: { ...genome, id: String(context.alternateId || `alternate-${Date.now()}`), alternateOf: genome.id || null, alternate: true } };
}

async function hotSpare(context = {}) {
  const spares = Array.isArray(context.spares) ? context.spares : [];
  const available = spares.find((spare) => spare && spare.healthy !== false && spare.status !== 'failed');
  return { success: Boolean(available), selected: available || null, available: spares.length };
}

async function healthSwitch(context = {}) {
  const primary = context.primary || {};
  const spare = context.spare || {};
  const useSpare = primary.healthy === false || primary.status === 'failed';
  return { success: Boolean(useSpare ? spare.id : primary.id), selected: useSpare ? spare : primary, switched: useSpare };
}

async function decoyBranch(context = {}) {
  const source = context.source || context.parent || {};
  const sourceId = source.id || 'main';
  const decoyId = String(context.decoyId || `decoy-${Date.now()}`);
  return { success: true, decoyId, isolated: true, sourceBranch: sourceId, sandboxed: true, tokenBudget: Math.max(100, Number(context.budget || 1000)), createdAt: new Date().toISOString() };
}

async function observe(context = {}) { return { success: true, observations: Array.isArray(context.events) ? context.events : [], observed: true }; }

async function destroyDecoy(context = {}) {
  const decoyId = String(context.decoyId || '').trim();
  if (!decoyId) return { success: false, error: 'decoyId is required.', code: 'DECOY_ID_REQUIRED' };
  return { success: true, destroyed: true, decoyId, destroyedAt: new Date().toISOString() };
}

module.exports = { frontierEscalation, impactGraph, invalidateAssumption, pairedEvaluation, heredityExperiment, branchEvolution, adversarialReview, blindCritics, contextCompaction, experiencePackets, knowledgeGraph, reviewedApply, inferTraits, replicate, promoteTrait, phenotypeEvidence, validateChild, alternateGenome, hotSpare, healthSwitch, decoyBranch, observe, destroyDecoy };
