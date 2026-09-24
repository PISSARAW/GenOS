'use strict';

const memory = require('../memory/symbioticMemoryService');
const store = require('../holobiontStore');
const contracts = require('../contracts/symbiosisContractService');
const immunePlane = require('../immune/holobiontImmunePlane');

const RELATIONS = Object.freeze([
  'SUPPLIES', 'VERIFIES', 'TRANSLATES', 'PROTECTS', 'CONSUMES', 'COMPETES', 'BACKS_UP', 'INHIBITS'
]);

function graphError(message, code = 'HOLOBIONT_INTERACTION_INVALID') {
  return Object.assign(new Error(message), { code });
}

function requiredText(value, field) {
  const result = String(value || '').trim();
  if (!result) throw graphError(`${field} is required.`);
  return result;
}

async function interactionContext(db, input) {
  const session = await store.getSession(db, input.holobiontId);
  if (!session) throw graphError('Holobiont session not found.', 'HOLOBIONT_SESSION_NOT_FOUND');
  if (Number(input.expectedSessionRevision) !== session.revision) throw graphError('Holobiont revision conflict.', 'HOLOBIONT_REVISION_CONFLICT');
  const from = requiredText(input.fromSymbiontId, 'fromSymbiontId');
  const to = requiredText(input.toSymbiontId, 'toSymbiontId');
  const relation = requiredText(input.relation, 'relation').toUpperCase();
  if (!RELATIONS.includes(relation)) throw graphError('Unknown symbiont interaction relation.');
  const residents = new Set(session.residentSymbionts.filter((item) => item.status === 'RESIDENT').map((item) => item.id));
  if (!residents.has(from) || !residents.has(to) || from === to) {
    throw graphError('Interaction endpoints must be distinct resident symbionts.', 'HOLOBIONT_INTERACTION_ENDPOINT_INVALID');
  }
  const endpoints = await Promise.all([
    contracts.authorizeSymbiontWork(db, { holobiontId: session.holobiontId, symbiontId: from, capability: input.fromCapability }),
    contracts.authorizeSymbiontWork(db, { holobiontId: session.holobiontId, symbiontId: to, capability: input.toCapability })
  ]);
  const evidenceRefs = Array.isArray(input.evidenceRefs) ? input.evidenceRefs.map((item) => requiredText(item, 'evidence reference')) : [];
  if (!evidenceRefs.length) throw graphError('Interaction evidence is required.', 'HOLOBIONT_EVIDENCE_REQUIRED');
  const relationId = requiredText(input.relationId || `${from}:${relation}:${to}:${session.revision}`, 'relationId');
  return { session, from, to, relation, endpoints, evidenceRefs, relationId };
}

async function reviewInteraction(input, context) {
  const { from, to, relation, evidenceRefs, relationId } = context;
  return Promise.all([from, to].map((symbiontId) => immunePlane.reviewSymbiontOutput({
    symbiontId, claim: `Host-approved interaction ${from} ${relation} ${to}`,
    resultHash: relationId, evidenceRefs, verifierId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  })));
}

async function storeInteraction(context) {
  const { db, input, session, from, to, relation, endpoints, evidenceRefs, relationId, reviews } = context;
  if (reviews.some((review) => !review.allowed)) return { accepted: false, relationId, reviews };
  const interaction = {
    type: 'INTERACTION_EDGE', relationId, from, to, relation,
    fromContractId: endpoints[0].contractId, toContractId: endpoints[1].contractId,
    evidenceRefs, reviews, promotionAuthority: 'HOST'
  };
  const record = await memory.recordMemory(db, {
    holobiontId: session.holobiontId, expectedSessionRevision: session.revision,
    memoryType: 'PARTNER_REPUTATION', scope: session.scope, content: interaction,
    evidenceRefs, dataClasses: input.dataClasses || [], authorId: input.verifierId,
    riskScore: input.riskScore, selfVerified: input.selfVerified === true
  });
  return record.accepted === false ? { accepted: false, relationId, reviews, immuneReview: record.immuneReview }
    : { accepted: true, relationId, memoryId: record.memoryId, interaction };
}

async function recordInteraction(db, input = {}) {
  const context = await interactionContext(db, input);
  const reviews = await reviewInteraction(input, context);
  return storeInteraction({ db, input, ...context, reviews });
}

async function buildSymbiontInteractionGraph(db, input = {}) {
  const episodes = await memory.recallMemories(db, { holobiontId: input.holobiontId, memoryType: 'EPISODIC' });
  const relations = await memory.recallMemories(db, { holobiontId: input.holobiontId, memoryType: 'PARTNER_REPUTATION' });
  const values = episodes.filter((item) => item.content.type === 'INTERMEDIATE_VALUE');
  const valueByMemory = new Map(values.map((item) => [item.memoryId, item]));
  const edges = episodes.filter((item) => item.content.type === 'INTERMEDIATE_CONSUMPTION')
    .map((item) => {
      const source = valueByMemory.get(item.content.valueMemoryId);
      if (!source) return null;
      return {
        from: source.content.producerSymbiontId,
        to: item.content.consumerSymbiontId,
        relation: 'SUPPLIES', valueId: source.content.valueId,
        producerMemoryId: source.memoryId, consumerMemoryId: item.memoryId,
        producerLedgerId: item.content.producerLedgerId,
        evidenceRefs: [...source.evidenceRefs, ...item.evidenceRefs]
      };
    }).filter(Boolean);
  const explicitEdges = relations.filter((item) => item.content.type === 'INTERACTION_EDGE')
    .map((item) => ({ ...item.content, memoryId: item.memoryId, evidenceRefs: item.evidenceRefs }));
  edges.push(...explicitEdges);
  return { holobiontId: input.holobiontId, nodes: uniqueNodes(edges), edges };
}

function uniqueNodes(edges) {
  return [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
}

module.exports = { buildSymbiontInteractionGraph, recordInteraction, RELATIONS };
