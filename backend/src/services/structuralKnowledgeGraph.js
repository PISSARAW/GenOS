'use strict';

/**
 * @file structuralKnowledgeGraph.js
 * @description Maintient les relations apprises et expose des queries pour le
 * sélecteur de stratégie.
 */

const { getDatabase, withTransaction } = require('../../db');
const telemetry = require('../telemetryObserver');
const { firstTruthy, firstNonNull } = require('./primitiveHandlers/searchHelpers');

const strategyRecommendations = new Map();

async function recordRelation(context = {}) {
  const db = await getDatabase();
  const sourceId = firstTruthy(context.sourceId, context.source_id, context.from);
  const targetId = firstTruthy(context.targetId, context.target_id, context.to);
  const relationType = firstTruthy(context.type, context.relation_type, context.relation, 'custom');
  const strength = Number(firstNonNull(context.strength, context.weight, 1.0));
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'structural_kg');
  const metadata = context.metadata || context.tags || {};

  if (!sourceId || !targetId) return { success: false, error: 'sourceId et targetId requis pour enregistrer une relation.' };

  const relationId = `rel_${sourceId}|||${targetId}|||${relationType}|||${Date.now()}`;
  await db.run(
    `INSERT OR REPLACE INTO knowledge_graph_relations (id, source_id, target_id, relation_type, strength, metadata_json, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    relationId, sourceId, targetId, relationType, strength, JSON.stringify(metadata), agentId
  );

  telemetry.emitEvent({
    eventType: 'KG_RELATION_RECORDED', agentId, action: 'RECORD_RELATION',
    detail: `Relation ${relationType} enregistrée: ${sourceId} → ${targetId} (force ${strength}).`,
    severity: 'info', payload: { relationId, sourceId, targetId, relationType, strength }
  });

  return { success: true, relation_id: relationId, source_id: sourceId, target_id: targetId, relation_type: relationType, strength, recorded: true, reason: `Relation ${relationType} enregistrée: ${sourceId} → ${targetId}.` };
}

async function outgoingRelations(context = {}) {
  const db = await getDatabase();
  const entityId = firstTruthy(context.entityId, context.entity_id, context.id, context.sourceId);
  const relationType = context.type || context.relation_type;
  if (!entityId) return { success: false, error: 'entityId requis.' };

  const query = relationType
    ? `SELECT source_id, target_id, relation_type, strength, metadata_json, created_at FROM knowledge_graph_relations WHERE source_id = ? AND relation_type = ? ORDER BY strength DESC, created_at DESC`
    : `SELECT source_id, target_id, relation_type, strength, metadata_json, created_at FROM knowledge_graph_relations WHERE source_id = ? ORDER BY strength DESC, created_at DESC`;
  const params = relationType ? [entityId, relationType] : [entityId];

  const rows = await db.all(query, ...params);
  const relations = rows.map(r => ({ source_id: r.source_id, target_id: r.target_id, relation_type: r.relation_type, strength: r.strength, metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}, created_at: r.created_at }));

  return { success: true, entity_id: entityId, relations, count: relations.length, reason: `Relations sortantes de "${entityId}": ${relations.length} trouvée(s).` };
}

async function incomingRelations(context = {}) {
  const db = await getDatabase();
  const entityId = firstTruthy(context.entityId, context.entity_id, context.id, context.targetId);
  const relationType = context.type || context.relation_type;
  if (!entityId) return { success: false, error: 'entityId requis.' };

  const query = relationType
    ? `SELECT source_id, target_id, relation_type, strength, metadata_json, created_at FROM knowledge_graph_relations WHERE target_id = ? AND relation_type = ? ORDER BY strength DESC, created_at DESC`
    : `SELECT source_id, target_id, relation_type, strength, metadata_json, created_at FROM knowledge_graph_relations WHERE target_id = ? ORDER BY strength DESC, created_at DESC`;
  const params = relationType ? [entityId, relationType] : [entityId];

  const rows = await db.all(query, ...params);
  const relations = rows.map(r => ({ source_id: r.source_id, target_id: r.target_id, relation_type: r.relation_type, strength: r.strength, metadata: r.metadata_json ? JSON.parse(r.metadata_json) : {}, created_at: r.created_at }));

  return { success: true, entity_id: entityId, relations, count: relations.length, reason: `Relations entrantes vers "${entityId}": ${relations.length} trouvée(s).` };
}

function computeStrategyScores(relations) {
  const scores = {};
  for (const r of relations) {
    if (r.relation_type === 'strategy_success') {
      scores[r.target_id] = (scores[r.target_id] || 0) + r.strength;
    }
    if (r.metadata && r.metadata.strategy) {
      scores[r.metadata.strategy] = (scores[r.metadata.strategy] || 0) + r.strength * 0.5;
    }
  }
  return scores;
}

function buildRecommendation(scores) {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recommended = sorted.length > 0 ? sorted[0][0] : 'adaptive_exploration';
  const score = sorted.length > 0 ? sorted[0][1] : 0.5;
  return {
    strategy: recommended,
    score: Number(score.toFixed(3)),
    alternatives: sorted.slice(1).map(([name, s]) => ({ name, score: Number(s.toFixed(3)) }))
  };
}

async function recommendStrategy(context = {}) {
  const db = await getDatabase();
  const contextId = firstTruthy(context.contextId, context.context_id, context.sessionId, context.agentId, 'default');
  const problemType = firstTruthy(context.problemType, context.type, context.problem, 'generic');
  const agentId = firstTruthy(context.agentId, context.agent_id, context.orchestratorId, 'structural_kg');
  const cacheKey = `${contextId}::${problemType}`;
  const cached = strategyRecommendations.get(cacheKey);

  if (cached && context.forceRefresh !== true) {
    return {
      success: true, strategy: cached.strategy, score: cached.score, from_cache: true,
      context_id: contextId, problem_type: problemType,
      reason: `Recommandation stratégie en cache pour contexte "${contextId}" / type "${problemType}".`
    };
  }

  const relations = await db.all(
    `SELECT relation_type, target_id, strength, metadata_json FROM knowledge_graph_relations WHERE source_id = ? AND relation_type IN ('context_association', 'strategy_success') ORDER BY strength DESC LIMIT 20`,
    contextId
  );

  const scores = computeStrategyScores(relations);
  const recommendation = buildRecommendation(scores);
  strategyRecommendations.set(cacheKey, { strategy: recommendation.strategy, score: recommendation.score });

  telemetry.emitEvent({
    eventType: 'KG_STRATEGY_RECOMMENDED', agentId, action: 'RECOMMEND_STRATEGY',
    detail: `Stratégie recommandée "${recommendation.strategy}" pour contexte "${contextId}" (score ${recommendation.score.toFixed(3)}).`,
    severity: 'info', payload: { recommended: recommendation.strategy, score: recommendation.score, contextId, problemType, alternatives: recommendation.alternatives }
  });

  return {
    success: true, ...recommendation, from_cache: false, context_id: contextId, problem_type: problemType,
    reason: `Stratégie recommandée "${recommendation.strategy}" basée sur ${relations.length} relation(s) du graphe.`
  };
}

async function searchTraits(context = {}) {
  const db = await getDatabase();
  const query = String(firstTruthy(context.query, context.q, '')).trim().toLowerCase();
  const tag = context.tag || context.tags;
  const limit = Number(firstNonNull(context.limit, 20));

  if (!query && !tag) return { success: false, error: 'query ou tag requis.' };

  const rows = query
    ? await db.all(`SELECT id, trait_name, trait_description, promotion_level, confidence, usage_count, created_at FROM learned_traits WHERE LOWER(trait_name) LIKE ? OR LOWER(trait_description) LIKE ? ORDER BY promotion_level DESC, confidence DESC LIMIT ?`, `%${query}%`, `%${query}%`, limit)
    : await db.all(`SELECT id, trait_name, trait_description, promotion_level, confidence, usage_count, created_at FROM learned_traits WHERE trait_data_json LIKE ? ORDER BY promotion_level DESC, confidence DESC LIMIT ?`, `%${tag}%`, limit);

  const traits = rows.map(r => ({
    trait_id: r.id, trait_name: r.trait_name, description: r.trait_description,
    promotion_level: r.promotion_level, confidence: r.confidence, usage_count: r.usage_count,
    created_at: r.created_at, promoted: r.promotion_level >= 1
  }));

  return { success: true, query, tag, traits, count: traits.length, reason: `Recherche de traits: ${traits.length} trouvé(s) pour "${query || tag}".` };
}

module.exports = { recordRelation, outgoingRelations, incomingRelations, recommendStrategy, searchTraits, strategyRecommendations };
