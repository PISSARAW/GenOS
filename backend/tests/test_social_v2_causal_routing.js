'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-causal-routing-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const relations = require('../src/services/crossAgentRelationalService');
const learning = require('../src/services/relationOutcomeLearningService');
const routing = require('../src/services/communication/relationshipCommunicationRoutingService');

const SCOPE = { organizationId: 'social-v2-org', projectId: 'social-v2-project' };
const DOMAIN = 'navigation';

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('social-v2-org', 'SocialWorld V2')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('social-v2-project', 'social-v2-org', 'SocialWorld V2')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('social-v2-space', 'SocialWorld V2', 'social-v2', 'social-v2-org', 'social-v2-project')");
  for (const id of ['agent-a', 'agent-b', 'agent-c']) {
    await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
      [id, id, 'worker', 'idle', 'worker', 'social-v2-space']);
  }
  await createCollaborationRelations(db);
}

async function createCollaborationRelations(db) {
  for (const targetAgentId of ['agent-b', 'agent-c']) {
    await relations.createRelation({ db, id: `relation-${targetAgentId}`, sourceAgentId: 'agent-a',
      targetAgentId, relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
  }
}

async function createEvaluation(db, input) {
  const result = { verified: input.verified, oracleRef: input.verified ? `oracle:${input.id}` : null };
  await db.run(`INSERT INTO evaluation_runs
    (id, benchmark, model_version, prompt_hash, config_hash, score, result_json, agent_id, organization_id, project_id)
    VALUES (?, ?, 'social-v2-fixture', ?, ?, ?, ?, ?, ?, ?)`,
  [input.id, `SocialWorld:${DOMAIN}`, `prompt:${input.id}`, `config:${input.id}`, input.score,
    JSON.stringify(result), input.agentId, SCOPE.organizationId, SCOPE.projectId]);
}

async function recordHistory(db, input) {
  for (const [index, score] of input.scores.entries()) {
    const id = `${input.agentId}-evaluation-${index + 1}`;
    await createEvaluation(db, { id, agentId: input.agentId, score, verified: true });
  }
  await learning.recordEvaluationOutcome({ db, relationId: `relation-${input.agentId}`,
    evaluationRunId: `${input.agentId}-evaluation-1`, domain: DOMAIN, ...SCOPE });
}

async function routedRecipients(db) {
  const candidates = await routing.profileAudience({ db,
    intent: { senderAgentId: 'agent-a', risk: 'low', domain: DOMAIN },
    candidates: [{ agentId: 'agent-b' }, { agentId: 'agent-c' }], ...SCOPE });
  return candidates.map((candidate) => ({ agentId: candidate.agentId,
    trust: candidate.communicationProfile.trustForDomain }));
}

async function verifyFutureRouteUsesVerifiedHistory(db) {
  await recordHistory(db, { agentId: 'agent-b', scores: [1, 1, 0, 0, 0] });
  await recordHistory(db, { agentId: 'agent-c', scores: [1, 1, 1, 1, 1] });
  const recipients = await routedRecipients(db);
  assert.deepEqual(recipients.map((item) => item.agentId), ['agent-c', 'agent-b']);
  assert.equal(recipients[0].trust, 0.857143);
  assert.equal(recipients[1].trust, 0.428571);
}

async function verifyUnverifiedHistoryCannotInfluenceRoute(db) {
  await createEvaluation(db, { id: 'agent-b-unverified', agentId: 'agent-b', score: 1, verified: false });
  await assert.rejects(() => learning.recordEvaluationOutcome({ db, relationId: 'relation-agent-b',
    evaluationRunId: 'agent-b-unverified', domain: DOMAIN, ...SCOPE }),
  (error) => error.code === 'RELATION_OUTCOME_UNVERIFIED');
  const recipients = await routedRecipients(db);
  assert.deepEqual(recipients.map((item) => item.agentId), ['agent-c', 'agent-b']);
  assert.equal(recipients[1].trust, 0.428571);
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    await createWorld(db);
    await verifyFutureRouteUsesVerifiedHistory(db);
    await verifyUnverifiedHistoryCannotInfluenceRoute(db);
    console.log('SocialWorld V2 verified history changed a later route; unverified history was rejected.');
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
