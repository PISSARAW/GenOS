'use strict';

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${field} is required.`);
  return text;
}

function resultOf(run) {
  let result;
  try { result = JSON.parse(run.result_json || '{}'); }
  catch (_) { throw Object.assign(new Error('Evaluation result is not valid JSON.'), { code: 'RELATION_OUTCOME_UNVERIFIED' }); }
  if (result.verified !== true || !String(result.oracleRef || '').trim()) {
    throw Object.assign(new Error('Relation learning requires a verified evaluation with an oracle reference.'), { code: 'RELATION_OUTCOME_UNVERIFIED' });
  }
  const score = Number(run.score);
  if (!Number.isFinite(score) || (score !== 0 && score !== 1)) {
    throw Object.assign(new Error('Relation learning accepts only resolved binary evaluations.'), { code: 'RELATION_OUTCOME_UNRESOLVED' });
  }
  return { success: score === 1, oracleRef: result.oracleRef };
}

async function loadRelation(db, relationId, scope) {
  const relation = await db.get(
    `SELECT id, target_agent_id AS targetAgentId, metadata_json AS metadataJson
     FROM agent_relations WHERE id = ? AND organization_id = ? AND project_id = ?`,
    [relationId, scope.organizationId, scope.projectId]);
  if (!relation) throw Object.assign(new Error('Relation is outside the requested scope.'), { code: 'RELATION_NOT_FOUND' });
  return relation;
}

async function verifiedEvaluation(db, evaluationRunId, relation, scope, domain) {
  const run = await db.get(
    `SELECT id, score, result_json FROM evaluation_runs
     WHERE id = ? AND agent_id = ? AND organization_id = ? AND project_id = ? AND benchmark = ?`,
    [evaluationRunId, relation.targetAgentId, scope.organizationId, scope.projectId, `SocialWorld:${domain}`]);
  if (!run) throw Object.assign(new Error('Evaluation is missing, out of scope, or belongs to another agent/domain.'), { code: 'RELATION_OUTCOME_UNVERIFIED' });
  return { ...resultOf(run), id: run.id };
}

async function aggregateEvidence(db, relation, scope, domain) {
  const rows = await db.all(
    `SELECT id, score, result_json FROM evaluation_runs
     WHERE agent_id = ? AND organization_id = ? AND project_id = ? AND benchmark = ? ORDER BY id`,
    [relation.targetAgentId, scope.organizationId, scope.projectId, `SocialWorld:${domain}`]);
  const outcomes = rows.map((row) => ({ id: row.id, ...resultOf(row) }));
  const successes = outcomes.filter((outcome) => outcome.success).length;
  const failures = outcomes.length - successes;
  return { outcomes, successes, failures, trust: Number(((1 + successes) / (2 + outcomes.length)).toFixed(6)) };
}

async function updateRelationEvidence(db, relation, domain, aggregate) {
  let metadata;
  try { metadata = JSON.parse(relation.metadataJson || '{}'); }
  catch (_) { throw Object.assign(new Error('Relation metadata is not valid JSON.'), { code: 'RELATION_METADATA_INVALID' }); }
  const trustByDomain = { ...(metadata.trustByDomain || {}), [domain]: aggregate.trust };
  const learningEvidence = { ...(metadata.learningEvidence || {}), [domain]: aggregate.outcomes.map((item) => item.id) };
  metadata.trustByDomain = trustByDomain;
  metadata.learningEvidence = learningEvidence;
  await db.run('UPDATE agent_relations SET trust_for_domain = ?, metadata_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [JSON.stringify(trustByDomain), JSON.stringify(metadata), relation.id]);
  return { trustByDomain, learningEvidence };
}

async function recordEvaluationOutcome(input = {}) {
  const scope = { organizationId: requiredText(input.organizationId, 'organizationId'),
    projectId: requiredText(input.projectId, 'projectId') };
  const relationId = requiredText(input.relationId, 'relationId');
  const domain = requiredText(input.domain, 'domain');
  const evaluationRunId = requiredText(input.evaluationRunId, 'evaluationRunId');
  const db = input.db || await require('../db').getDatabase();
  return require('../db').withTransaction(db, async (tx) => {
    const relation = await loadRelation(tx, relationId, scope);
    const current = await verifiedEvaluation(tx, evaluationRunId, relation, scope, domain);
    const aggregate = await aggregateEvidence(tx, relation, scope, domain);
    const persisted = await updateRelationEvidence(tx, relation, domain, aggregate);
    return { relationId, domain, evaluationRunId, current, outcomes: aggregate.outcomes,
      successes: aggregate.successes, failures: aggregate.failures, trust: aggregate.trust,
      persisted: persisted.trustByDomain[domain] === aggregate.trust };
  });
}

module.exports = { recordEvaluationOutcome };
