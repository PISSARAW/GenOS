'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.GENOS_ADMIN_PASSWORD ||= 'worker-relations-e2e-only';

const { getDatabase, closeDatabase } = require('../src/db');
const evolution = require('../src/services/agentEvolutionService');
const relations = require('../src/services/crossAgentRelationalService');
const family = require('../src/services/familyHistoryService');
const kinship = require('../src/services/socialKinshipService');
const breeding = require('../src/services/breedingRelationshipService');
const learning = require('../src/services/relationOutcomeLearningService');
const profiles = require('../src/services/communication/relationshipCommunicationProfileService');
const projection = require('../src/services/relationalPhysiology/executionProjection');
const mutation = require('../src/services/primitiveHandlers/evolutionMutate');
const breed = require('../src/services/primitiveHandlers/evolutionBreed');
const genosCli = require('../src/services/genosCli');

const SCOPE = { organizationId: 'relations-e2e-org', projectId: 'relations-e2e-project' };
const WORKSPACE = 'relations-e2e-workspace';

async function seedWorld(db) {
  await db.run("INSERT INTO organizations(id,name) VALUES (?,'Relations E2E')", SCOPE.organizationId);
  await db.run("INSERT INTO projects(id,organization_id,name) VALUES (?,?,'Relations E2E')",
    SCOPE.projectId, SCOPE.organizationId);
  await db.run("INSERT INTO workspaces(id,name,path,organization_id,project_id) VALUES (?,'Relations E2E','/memory-only',?,?)",
    WORKSPACE, SCOPE.organizationId, SCOPE.projectId);
  for (const id of ['grand-a', 'grand-b', 'parent-a', 'parent-b']) {
    await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id) VALUES (?,?,'worker','idle','worker',?)",
      id, id, WORKSPACE);
  }
  const genes = { role: 'worker', strategy: 'stable-parent', tools: ['genos_inspect'],
    temp: 0.2, topP: 0.8 };
  for (const id of ['grand-a', 'grand-b']) {
    const result = await evolution.recordWorkerLineage(db,
      { agentId: id, workspaceId: WORKSPACE, name: id, role: 'worker' }, { genes });
    assert.equal(result.success, true, result.error);
  }
  for (const [id, parentId] of [['parent-a', 'grand-a'], ['parent-b', 'grand-b']]) {
    const result = await evolution.recordWorkerLineage(db,
      { agentId: id, workspaceId: WORKSPACE, name: id, role: 'worker' },
      { parentId, edgeType: 'lineage', genes });
    assert.equal(result.success, true, result.error);
  }
}

async function addChild(db, input) {
  const { id, parents, genes } = input;
  await db.run("INSERT INTO agents(id,name,role,status,execution_mode,workspace_id,parent_agent_id) VALUES (?,?,'offspring','idle','worker',?,'parent-a')",
    id, id, WORKSPACE);
  const result = await evolution.recordWorkerLineage(db,
    { agentId: id, workspaceId: WORKSPACE, name: id, role: 'offspring' },
    { parentIds: parents, edgeType: 'crossover_lineage', genes });
  assert.equal(result.success, true, result.error);
}

async function addVerifiedOutcomes(db) {
  for (let index = 1; index <= 3; index += 1) {
    const id = `friend-evaluation-${index}`;
    await db.run(`INSERT INTO evaluation_runs
      (id,benchmark,model_version,prompt_hash,config_hash,score,result_json,agent_id,organization_id,project_id)
      VALUES (?,'SocialWorld:code','e2e',?,?,1,?,'parent-b',?,?)`,
    id, `prompt-${index}`, `config-${index}`,
    JSON.stringify({ verified: true, oracleRef: `oracle-${index}` }),
    SCOPE.organizationId, SCOPE.projectId);
  }
}

test('worker relations drive lineage, family, mutation, friendship and subordination', async (context) => {
  const db = await getDatabase(':memory:');
  context.after(closeDatabase);
  await seedWorld(db);
  await relations.createRelation({ db, id: 'reproductive-partners', sourceAgentId: 'parent-a',
    targetAgentId: 'parent-b', relationType: 'partner', ...SCOPE });
  assert.equal(await breeding.selectPartner(db,
    { parentA: 'parent-a', workspaceId: WORKSPACE, scope: SCOPE }), 'parent-b');

  const nativeCrossover = genosCli.runCrossover;
  context.after(() => { genosCli.runCrossover = nativeCrossover; });
  genosCli.runCrossover = async () => ({ ok: true, json: { success: true, engine: 'e2e-stub' } });
  const bred = await breed.breed({ parentA: 'parent-a' });
  assert.equal(bred.success, true, bred.error);
  assert.equal(bred.parentB, 'parent-b');
  const childOne = bred.childId;
  const genes = bred.childGenes;
  const childKinship = await kinship.getKinshipProfile({ db, agentId: childOne, ...SCOPE });
  assert.deepEqual(childKinship.parents, ['parent-a', 'parent-b']);
  const childStory = await family.buildFamilyStory(db, childOne, {});
  assert.deepEqual(new Set(childStory.ancestry.map((item) => item.agentId)),
    new Set([childOne, 'parent-a', 'parent-b', 'grand-a', 'grand-b']));
  assert.equal((await family.buildFamilyStory(db, 'parent-a', {})).descendantCount, 1);
  assert.equal((await family.buildFamilyStory(db, 'parent-b', {})).descendantCount, 1);

  const parentProfile = await profiles.deriveProfile({ db, fromAgentId: 'parent-a',
    toAgentId: childOne, ...SCOPE });
  assert.ok(parentProfile.relationTypes.includes('parent'));
  assert.ok(parentProfile.relationTypes.includes('manager'));
  assert.ok(parentProfile.relationTypes.includes('subordinate'));
  const loaded = await projection.loadProjection(db, { actorId: 'parent-a', receiverId: childOne,
    scope: SCOPE, at: Date.now() });
  assert.equal(loaded.context.agents.find((agent) => agent.id === childOne).role, 'adaptive_worker');

  await addChild(db, { id: 'child-two', parents: ['parent-a'], genes });
  const siblingProfile = await profiles.deriveProfile({ db, fromAgentId: childOne,
    toAgentId: 'child-two', ...SCOPE });
  assert.ok(siblingProfile.relationTypes.includes('sibling'));
  await assert.rejects(breeding.assertCompatible(db, { parentA: childOne, parentB: 'child-two',
    scope: SCOPE }), (error) => error.code === 'BREEDING_CLOSE_KIN_REJECTED');

  const mutant = await mutation.mutateSingle({ agentId: childOne, targetGene: 'temp' });
  assert.equal(mutant.success, true, mutant.error);
  assert.deepEqual(Object.keys(genes).filter((key) => JSON.stringify(genes[key])
    !== JSON.stringify(mutant.genes[key])), ['temp']);
  const mutantKinship = await kinship.getKinshipProfile({ db, agentId: mutant.mutantId, ...SCOPE });
  assert.deepEqual(mutantKinship.parents, [childOne]);

  const friendship = await relations.createRelation({ db, id: 'friendship-candidate',
    sourceAgentId: 'parent-a', targetAgentId: 'parent-b', relationType: 'colleague', ...SCOPE });
  assert.equal(friendship.metadata.interactionCount, 5);
  await addVerifiedOutcomes(db);
  const learned = await learning.recordEvaluationOutcome({ db, relationId: friendship.id,
    evaluationRunId: 'friend-evaluation-1', domain: 'code', ...SCOPE });
  assert.equal(learned.friendshipPromoted, true);
  assert.equal(learned.relationType, 'friend');
  const storedFriend = await relations.getRelation({ db, id: friendship.id });
  assert.equal(storedFriend.relationType, 'friend');
});
