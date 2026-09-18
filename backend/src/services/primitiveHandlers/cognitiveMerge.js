'use strict';

const crypto = require('crypto');
const { getDatabase } = require('../../db');

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function hashPacket(packet) {
  return crypto.createHash('sha256').update(JSON.stringify(packet)).digest('hex');
}

function normalizeExperiences(context) {
  if (Array.isArray(context.experiences)) return context.experiences.filter(Boolean);
  if (context.experience && typeof context.experience === 'object') return [context.experience];
  return [];
}

function hasEvidence(experience) {
  return Array.isArray(experience.evidence) && experience.evidence.length > 0;
}

function buildPacket(context, experiences) {
  const sourceAgentId = firstValue(context.agentId, context.agent_id, context.orchestratorId, 'cognitive_merge');
  const packet = {
    sourceAgentId,
    sourceSessionId: firstValue(context.sessionId, context.session_id, null),
    experiences,
    provenance: context.provenance || { sourceAgentId, evidenceRequired: true },
    createdAt: new Date().toISOString()
  };
  return { ...packet, packetId: `xp_${hashPacket(packet).slice(0, 32)}` };
}

async function experiencePackets(context = {}) {
  const experiences = normalizeExperiences(context);
  if (!experiences.length) return { success: false, code: 'EXPERIENCES_REQUIRED', error: 'experiences are required.' };
  const incomplete = experiences.filter((experience) => !hasEvidence(experience));
  if (incomplete.length) return { success: false, code: 'EXPERIENCE_EVIDENCE_REQUIRED', error: 'Every experience requires evidence.', incompleteCount: incomplete.length };
  const packet = buildPacket(context, experiences);
  context.experiencePacket = packet;
  return { success: true, packet, packetId: packet.packetId, count: experiences.length };
}

function relationInputs(context) {
  if (Array.isArray(context.relations)) return context.relations;
  return context.experiencePacket?.relations || [];
}

function relationId(packetId, relation, index) {
  return `kg_${hashPacket({ packetId, relation, index }).slice(0, 32)}`;
}

async function databaseFor(context) {
  return context.db || getDatabase();
}

function normalizeRelation(relation, packet, index) {
  const sourceId = firstValue(relation.sourceId, relation.source_id, packet.packetId);
  const targetId = firstValue(relation.targetId, relation.target_id, relation.target);
  const type = firstValue(relation.relationType, relation.relation_type, relation.type);
  if (!targetId || !type) return null;
  return {
    id: relationId(packet.packetId, relation, index),
    sourceId,
    targetId,
    type,
    strength: Number.isFinite(Number(relation.strength)) ? Number(relation.strength) : 0.5,
    metadata: { ...(relation.metadata || {}), packetId: packet.packetId, reviewStatus: 'pending' }
  };
}

async function knowledgeGraph(context = {}) {
  const packet = context.experiencePacket || context.packet;
  if (!packet?.packetId) return { success: false, code: 'EXPERIENCE_PACKET_REQUIRED', error: 'experience_packets must run first.' };
  const relations = relationInputs(context).map((relation, index) => normalizeRelation(relation, packet, index)).filter(Boolean);
  if (!relations.length) return { success: false, code: 'RELATIONS_REQUIRED', error: 'At least one knowledge-graph relation is required.' };
  const db = await databaseFor(context);
  for (const relation of relations) {
    await db.run(
      `INSERT OR REPLACE INTO knowledge_graph_relations
       (id, source_id, target_id, relation_type, strength, metadata_json, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      relation.id, relation.sourceId, relation.targetId, relation.type,
      relation.strength, JSON.stringify(relation.metadata), packet.sourceAgentId
    );
  }
  context.knowledgeGraphRelations = relations;
  return { success: true, packetId: packet.packetId, relationIds: relations.map((relation) => relation.id), count: relations.length, status: 'pending_review' };
}

function approved(context) {
  return context.review === 'approved' || context.reviewDecision === 'approved' || context.approved === true;
}

async function reviewedApply(context = {}) {
  if (!approved(context)) return { success: false, code: 'REVIEW_REQUIRED', error: 'An explicit approved review is required.' };
  const relations = context.knowledgeGraphRelations || [];
  if (!relations.length) return { success: false, code: 'KNOWLEDGE_GRAPH_REQUIRED', error: 'knowledge_graph must run first.' };
  const db = await databaseFor(context);
  for (const relation of relations) {
    const metadata = { ...(relation.metadata || {}), reviewStatus: 'approved', approvedAt: new Date().toISOString() };
    await db.run('UPDATE knowledge_graph_relations SET metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', JSON.stringify(metadata), relation.id);
  }
  return { success: true, applied: relations.length, status: 'applied', relationIds: relations.map((relation) => relation.id) };
}

module.exports = { experiencePackets, knowledgeGraph, reviewedApply };
