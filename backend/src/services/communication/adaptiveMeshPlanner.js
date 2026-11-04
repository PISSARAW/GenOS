'use strict';

const { computeKnowledgeDelta } = require('./commonGroundService');
const { getExpertise, DEFAULT_WEIGHTS } = require('./transactiveMemoryService');
const { profileAudience, groundingForAudience } = require('./relationshipCommunicationRoutingService');

const PROTECTED_TRIGGERS = new Set(['BLOCKER_DETECTED', 'CONTRADICTION_FOUND', 'HANDOFF_REQUESTED',
  'TOPOLOGY_TRANSITION', 'RETRACTION', 'REFERENCE_REVOKED', 'INVALIDATION']);

function requiredIntent(intent) {
  if (intent.requiresAction || intent.independenceRequired) return true;
  if (intent.risk !== 'low' || intent.urgency >= 0.8) return true;
  if (!['inform', 'coordinate', 'teach'].includes(intent.purpose)) return true;
  return Boolean(intent.invalidation || intent.retraction);
}

function opaqueContent(intent) {
  return intent.payload != null || Boolean(intent.artifactRefs?.length);
}

function protectedIntent(input, context) {
  const intent = input.intent;
  if (requiredIntent(intent) || opaqueContent(intent)) return true;
  if (input.decision.action !== 'SIGNAL') return true;
  if (!intent.semanticRefs?.length) return true;
  if (Array.isArray(intent.requestedAudience)) return true;
  if (PROTECTED_TRIGGERS.has(input.options?.trigger || intent.checkpoint)) return true;
  if (!['peer_mesh', 'capability', 'orchestrator', 'ranked'].includes(context.state.policy.routing)) return true;
  return ['QUORUM', 'GLOBAL_BROADCAST'].includes(input.decision.scope);
}

function expertiseScore(expertise) {
  if (!expertise) return 0;
  return ['competence', 'calibration', 'reliability', 'freshness'].reduce((total, key) => {
    const value = Number.isFinite(expertise[key]) ? Math.max(0, Math.min(1, expertise[key])) : 0;
    return total + value * DEFAULT_WEIGHTS[key];
  }, 0);
}

async function candidateOf(input, agentId, protectedDelivery) {
  const semanticRefs = [...new Set(input.intent.semanticRefs || [])];
  const unknownRefs = protectedDelivery ? semanticRefs : await computeKnowledgeDelta({
    db: input.db, senderId: input.intent.senderAgentId, receiverId: agentId,
    domain: input.intent.domain, semanticRefs });
  const expertise = await getExpertise({ db: input.db, agentId, domain: input.intent.domain });
  return { agentId, unknownRefs, score: expertiseScore(expertise) };
}

function compareCandidates(left, right) {
  const score = right.score - left.score;
  if (score !== 0) return score;
  const novelty = right.unknownRefs.length - left.unknownRefs.length;
  if (novelty !== 0) return novelty;
  return left.agentId < right.agentId ? -1 : left.agentId > right.agentId ? 1 : 0;
}

function unionRefs(candidates, refs) {
  const unknown = new Set(candidates.flatMap(candidate => candidate.unknownRefs));
  return [...new Set(refs)].filter(ref => unknown.has(ref));
}

function exclusionsFor(before, after, reason) {
  const selected = new Set(after.map(candidate => candidate.agentId));
  return before.filter(candidate => !selected.has(candidate.agentId))
    .map(candidate => ({ agentId: candidate.agentId, reason }));
}

function strongerGrounding(decision, intent, selected) {
  const levels = ['none', 'transport_ack', 'semantic_ack', 'action_ack', 'verified_ack', 'human_confirmation'];
  const derived = groundingForAudience(intent, selected);
  return levels.indexOf(decision.grounding) >= levels.indexOf(derived) ? decision.grounding : derived;
}

async function planMesh(input, context, maxFanout) {
  const protectedDelivery = protectedIntent(input, context);
  const candidates = await Promise.all(context.allowed.map(id => candidateOf(input, id, protectedDelivery)));
  const eligible = await profileAudience({ db: input.db, intent: input.intent,
    candidates, ...context.scope });
  const useful = protectedDelivery ? eligible : eligible.filter(candidate => candidate.unknownRefs.length > 0);
  const ranked = [...useful].sort(compareCandidates);
  const selected = protectedDelivery ? eligible : ranked.slice(0, maxFanout);
  const excluded = [...context.excluded,
    ...exclusionsFor(candidates, eligible, 'MESH_RELATION_DENIED'),
    ...exclusionsFor(eligible, useful, 'MESH_COMMON_GROUND_LEDGER'),
    ...exclusionsFor(useful, selected, 'MESH_FANOUT_LIMIT')];
  return { protected: protectedDelivery, recipients: selected.map(candidate => candidate.agentId), excluded,
    semanticRefs: protectedDelivery ? [...new Set(input.intent.semanticRefs || [])]
      : unionRefs(selected, input.intent.semanticRefs || []),
    grounding: strongerGrounding(input.decision, input.intent, selected),
    edges: selected.map(candidate => ({ from: input.intent.senderAgentId, to: candidate.agentId,
      expertiseScore: candidate.score, unknownRefs: candidate.unknownRefs })) };
}

module.exports = { planMesh, compareCandidates, protectedIntent };
