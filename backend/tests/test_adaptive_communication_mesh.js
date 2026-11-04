'use strict';

const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { applyAdaptiveMesh, SCHEMA_VERSION } = require('../src/services/communication/adaptiveCommunicationMesh');
const expertise = require('../src/services/communication/transactiveMemoryService');
const ground = require('../src/services/communication/commonGroundService');
const plasticity = require('../src/services/synapticPlasticityService');
const { organizationProfile } = require('../src/services/dynamicOrganizationService');

const RECIPIENTS = ['d', 'b', 'a', 'c'];
const REFS = ['proof:one', 'proof:two'];

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT, parent_agent_id TEXT,
      execution_mode TEXT, status TEXT, workspace_id TEXT, model_tier TEXT);
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, orchestrator_agent_id TEXT);
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT, PRIMARY KEY (mission_id, agent_id));
    CREATE TABLE agent_organization_state (orchestrator_id TEXT PRIMARY KEY, organization TEXT,
      version INTEGER, policy_json TEXT);
    CREATE TABLE agent_relations (id TEXT PRIMARY KEY, source_agent_id TEXT, target_agent_id TEXT,
      relation_type TEXT, relation_class TEXT, metadata_json TEXT, organization_id TEXT,
      project_id TEXT, updated_at TEXT);
    INSERT INTO workspaces VALUES ('home', 'org', 'project'), ('project-elsewhere', 'org', 'other'),
      ('org-elsewhere', 'other', 'project');
    INSERT INTO missions VALUES ('mission', 'owner'), ('other-mission', 'owner');`);
  await addAgent(db, { id: 'owner', mode: 'orchestrator', parent: null });
  for (const id of ['sender', ...RECIPIENTS]) await addAgent(db, { id });
  await addAgent(db, { id: 'other-project', workspace: 'project-elsewhere' });
  await addAgent(db, { id: 'other-org', workspace: 'org-elsewhere' });
  await addAgent(db, { id: 'other-team', parent: 'other-owner' });
  await addAgent(db, { id: 'inactive', status: 'completed' });
  await addAgent(db, { id: 'other-mission', mission: 'other-mission' });
  await setOrganization(db, 'cross_functional_pod');
  await expertise.ensureTables(db);
  await ground.ensureTables(db);
  for (const agentId of RECIPIENTS) {
    await db.run('INSERT INTO agent_expertise (agent_id, domain, competence) VALUES (?, ?, ?)',
      agentId, 'math', agentId === 'c' ? 0.9 : 0.7);
  }
  return db;
}

async function addAgent(db, options) {
  const { id, mode = 'worker', parent = 'owner', status = 'active', workspace = 'home', mission = 'mission' } = options;
  await db.run('INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)',
    id, mode, parent, mode, status, workspace, 'Flash');
  await db.run('INSERT INTO mission_agents VALUES (?, ?)', mission, id);
}

function setOrganization(db, organization) {
  return db.run(`INSERT OR REPLACE INTO agent_organization_state VALUES (?, ?, ?, ?)`,
    'owner', organization, 1, JSON.stringify(organizationProfile(organization)));
}

function decision(recipients = RECIPIENTS) {
  return { action: 'SIGNAL', scope: 'SELECTIVE_MULTICAST', recipients: [...recipients],
    encoding: 'semantic-fingerprint', grounding: 'none', ttlMs: 60000, reasonCodes: ['FIXTURE'],
    meta: { cost: 0.1, utility: 0.5,
      groups: [{ profile: 'all', role: 'worker', members: [...recipients], unknownRefs: [...REFS] },
        { profile: 'd-only', role: 'worker', members: ['d'], unknownRefs: [...REFS] }],
      relationshipRouting: recipients.map(agentId => ({ agentId })) } };
}

function request(db, changes = {}) {
  return { db, decision: changes.decision || decision(),
    intent: { senderAgentId: 'sender', missionId: 'mission', domain: 'math', purpose: 'inform',
      risk: 'low', urgency: 0.5, requiresAction: false, semanticRefs: [...REFS],
      scope: { organizationId: 'org', projectId: 'project' }, ...changes.intent },
    options: { mode: 'active', maxFanout: 3, ...changes.options } };
}

async function remember(db, recipients, refs = REFS) {
  for (const receiverId of recipients) {
    for (const semanticFingerprint of refs) {
      await ground.recordGrounding({ db, agentA: 'sender', agentB: receiverId, domain: 'math',
        semanticFingerprint, status: 'grounded', confidence: 1 });
    }
  }
}

function audit(result) { return result.meta.adaptiveMesh; }

function assertBlocked(result, reason) {
  assert.equal(result.action, 'SILENCE');
  assert.deepEqual(result.recipients, []);
  assert.equal(audit(result).status, 'blocked');
  assert.ok(audit(result).reasonCodes.includes(reason));
}

async function disabledAndConfiguration() {
  const proposed = decision();
  const input = { decision: proposed, options: { mode: 'off' } };
  Object.defineProperty(input, 'db', { get() { throw new Error('off must not read the database'); } });
  assert.strictEqual(await applyAdaptiveMesh(input), proposed);
  await assert.rejects(() => applyAdaptiveMesh({ decision: proposed, options: { mode: 'invented' } }), /MESH_MODE_INVALID/);
  await assert.rejects(() => applyAdaptiveMesh({ decision: proposed, options: { maxFanout: 0 } }), /MESH_FANOUT_INVALID/);
}

async function shadowAndDeterministicFanout(db) {
  const input = request(db, { options: { mode: 'shadow', maxFanout: 1 } });
  const original = structuredClone(input.decision);
  const shadow = await applyAdaptiveMesh(input);
  const unchanged = structuredClone(shadow);
  delete unchanged.meta.adaptiveMesh;
  assert.deepEqual(unchanged, original, 'shadow must keep the actual decision and payload groups');
  assert.deepEqual(input.decision, original, 'planning must not mutate its input');
  assert.deepEqual(audit(shadow).proposedRecipients, ['c']);
  const active = await applyAdaptiveMesh(request(db));
  assert.deepEqual(active.recipients, ['c', 'a', 'b'], 'score first, deterministic IDs for equal scores');
  assert.deepEqual(audit(active).edges.map(edge => [edge.from, edge.to]),
    [['sender', 'c'], ['sender', 'a'], ['sender', 'b']]);
  assert.ok(audit(active).excluded.some(entry => entry.agentId === 'd' && entry.reason === 'MESH_FANOUT_LIMIT'));
  const reordered = await applyAdaptiveMesh(request(db, { decision: decision([...RECIPIENTS].reverse()) }));
  assert.deepEqual(reordered.recipients, active.recipients);
  assert.equal(active.grounding, 'semantic_ack', 'mesh cannot weaken relationship grounding');
}

async function scopeAndMembership(db) {
  const recipients = ['a', 'other-project', 'other-org', 'other-mission', 'other-team', 'inactive', 'missing', 'sender'];
  const result = await applyAdaptiveMesh(request(db, { decision: decision(recipients) }));
  assert.deepEqual(result.recipients, ['a']);
  const excluded = Object.fromEntries(audit(result).excluded.map(entry => [entry.agentId, entry.reason]));
  assert.deepEqual(excluded, { 'other-project': 'MESH_SCOPE_MISMATCH', 'other-org': 'MESH_SCOPE_MISMATCH',
    'other-mission': 'MESH_MISSION_DENIED', 'other-team': 'MESH_ORGANIZATION_DENIED',
    inactive: 'MESH_RECIPIENT_INACTIVE', missing: 'MESH_MISSION_DENIED', sender: 'MESH_SELF_RECIPIENT' });
  assert.equal(audit(result).missionId, 'mission');
  assert.deepEqual(audit(result).scope, { organizationId: 'org', projectId: 'project' });
}

async function requiredAudience(db) {
  await remember(db, RECIPIENTS);
  const input = request(db, { intent: { requestedAudience: [...RECIPIENTS] }, options: { maxFanout: 1 } });
  const result = await applyAdaptiveMesh(input);
  assert.deepEqual(result.recipients, RECIPIENTS, 'explicit obligations must survive cap and known references');
  assert.equal(audit(result).protected, true);
  assert.deepEqual(audit(result).semanticRefs, REFS);
  const denied = request(db, { decision: decision(['a', 'other-project']),
    intent: { requestedAudience: ['a', 'other-project'] }, options: { maxFanout: 1 } });
  assertBlocked(await applyAdaptiveMesh(denied), 'MESH_REQUIRED_RECIPIENT_DENIED');
  const shadow = await applyAdaptiveMesh({ ...denied, options: { ...denied.options, mode: 'shadow' } });
  assert.deepEqual(shadow.recipients, ['a', 'other-project']);
  assert.equal(audit(shadow).status, 'blocked');
  const widened = request(db, { decision: decision(['a', 'b']), intent: { requestedAudience: ['a'] } });
  assertBlocked(await applyAdaptiveMesh(widened), 'MESH_REQUIRED_RECIPIENT_DENIED');
  const partial = request(db, { decision: decision(['a']), intent: { requestedAudience: ['a', 'b'] } });
  assertBlocked(await applyAdaptiveMesh(partial), 'MESH_REQUIRED_RECIPIENT_DENIED');
  assertBlocked(await applyAdaptiveMesh(request(db, { intent: { requestedAudience: [] } })),
    'MESH_REQUIRED_RECIPIENT_DENIED');
}

async function protectedObligations(db) {
  await remember(db, RECIPIENTS);
  for (const trigger of ['RETRACTION', 'REFERENCE_REVOKED', 'INVALIDATION', 'CONTRADICTION_FOUND', 'HANDOFF_REQUESTED']) {
    const result = await applyAdaptiveMesh(request(db, { options: { maxFanout: 1, trigger } }));
    assert.deepEqual(result.recipients, RECIPIENTS, `${trigger} must not lose recipients or references`);
    assert.deepEqual(audit(result).semanticRefs, REFS);
  }
  for (const intent of [{ requiresAction: true }, { urgency: 0.9 }, { retraction: true },
    { payload: { unindexed: 'new information' } }, { artifactRefs: ['artifact:new'] }]) {
    const result = await applyAdaptiveMesh(request(db, { intent, options: { maxFanout: 1 } }));
    assert.deepEqual(result.recipients, RECIPIENTS);
  }
  const quorum = await applyAdaptiveMesh(request(db, {
    decision: { ...decision(), scope: 'QUORUM' }, options: { maxFanout: 1 } }));
  assert.deepEqual(quorum.recipients, RECIPIENTS);
  assert.equal(quorum.scope, 'QUORUM');
}

async function missingContext(db) {
  assertBlocked(await applyAdaptiveMesh(request(db, { intent: { missionId: undefined } })), 'MESH_MISSION_REQUIRED');
  assertBlocked(await applyAdaptiveMesh(request(db, { intent: { missionId: 'other-mission' } })), 'MESH_MISSION_DENIED');
  assertBlocked(await applyAdaptiveMesh(request(db, { intent: {
    scope: { organizationId: 'org', projectId: 'other' } } })), 'MESH_SCOPE_MISMATCH');
  await db.run('DELETE FROM mission_agents WHERE mission_id = ? AND agent_id = ?', 'mission', 'owner');
  assertBlocked(await applyAdaptiveMesh(request(db)), 'MESH_MISSION_OWNER_UNAVAILABLE');
}

async function institutionalRouting(db) {
  await setOrganization(db, 'specialist_expert_committee');
  const result = await applyAdaptiveMesh(request(db, { decision: decision(['a', 'owner']) }));
  assert.deepEqual(result.recipients, ['owner'], 'a hub worker must communicate through its orchestrator');
  assert.deepEqual(audit(result).excluded, [{ agentId: 'a', reason: 'MESH_TOPOLOGY_DENIED' }]);
  await db.run('DELETE FROM agent_organization_state');
  const fallback = await applyAdaptiveMesh(request(db, { decision: decision(['a']) }));
  assert.equal(fallback.action, 'SILENCE', 'missing organization state must not grant peer authority');
  await setOrganization(db, 'blind_adversarial_review');
  const blind = await applyAdaptiveMesh(request(db, { decision: decision(['a']) }));
  assertBlocked(blind, 'MESH_REQUIRED_RECIPIENT_DENIED');
  await db.run('UPDATE agent_organization_state SET policy_json = ?', JSON.stringify({ routing: 'broadcast' }));
  assertBlocked(await applyAdaptiveMesh(request(db, { decision: decision(['a']) })), 'MESH_REQUIRED_RECIPIENT_DENIED');
  await db.run('UPDATE agent_organization_state SET policy_json = ?',
    JSON.stringify({ routing: 'broadcast', visibility: 'attributed' }));
  assertBlocked(await applyAdaptiveMesh(request(db)), 'MESH_TOPOLOGY_UNAVAILABLE');
}

async function strongerGroundingCost(db) {
  const proposed = { ...decision(), meta: { ...decision().meta, utility: 0.01 } };
  const optional = await applyAdaptiveMesh(request(db, { decision: proposed }));
  assertBlocked(optional, 'MESH_NON_POSITIVE_UTILITY');
  const required = await applyAdaptiveMesh(request(db, { decision: proposed, intent: { requiresAction: true } }));
  assert.equal(required.action, 'SIGNAL', 'grounding cannot prune a mandatory action');
  assert.ok(required.meta.cost > proposed.meta.cost, 'stronger grounding must be included in budget cost');
}

async function senderAndOwner(db) {
  await db.run("UPDATE agents SET status = 'completed' WHERE id = 'sender'");
  assertBlocked(await applyAdaptiveMesh(request(db)), 'MESH_SENDER_INACTIVE');
  const completion = await applyAdaptiveMesh(request(db, { intent: { checkpoint: 'MISSION_COMPLETED' } }));
  assert.deepEqual(completion.recipients, ['c', 'a', 'b'], 'completed workers may still publish their final checkpoint');
  await db.run("UPDATE agents SET status = 'terminated' WHERE id = 'sender'");
  assertBlocked(await applyAdaptiveMesh(request(db, { intent: { checkpoint: 'MISSION_COMPLETED' } })), 'MESH_SENDER_INACTIVE');
  await db.run("UPDATE agents SET status = 'active' WHERE id = 'sender'");
  await db.run("UPDATE agents SET execution_mode = 'worker' WHERE id = 'owner'");
  assertBlocked(await applyAdaptiveMesh(request(db)), 'MESH_MISSION_OWNER_UNAVAILABLE');
}

async function independence(db) {
  const input = request(db, { decision: decision(['a']), intent: { independenceRequired: true } });
  assertBlocked(await applyAdaptiveMesh(input), 'MESH_REQUIRED_RECIPIENT_DENIED');
  await db.run(`INSERT INTO agent_relations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    'review', 'sender', 'a', 'verifier', 'epistemic', '{}', 'org', 'project', '2026-01-01');
  const qualified = await applyAdaptiveMesh(input);
  assert.deepEqual(qualified.recipients, ['a']);
  assert.equal(qualified.grounding, 'verified_ack');
  await db.run(`UPDATE agent_relations SET relation_type = 'twin', relation_class = 'lineage',
    metadata_json = '{"epistemicIndependence":1}' WHERE id = 'review'`);
  assertBlocked(await applyAdaptiveMesh(input), 'MESH_REQUIRED_RECIPIENT_DENIED');
}

async function knowledgeAndGroups(db) {
  await remember(db, RECIPIENTS, [REFS[0]]);
  const delta = await applyAdaptiveMesh(request(db));
  assert.deepEqual(audit(delta).semanticRefs, [REFS[1]]);
  assert.deepEqual(delta.meta.groups, [{ profile: 'all', role: 'worker',
    members: ['b', 'a', 'c'], unknownRefs: [REFS[1]] }]);
  assert.deepEqual(delta.meta.relationshipRouting.map(profile => profile.agentId), ['b', 'a', 'c']);
  await remember(db, RECIPIENTS, [REFS[1]]);
  const silence = await applyAdaptiveMesh(request(db));
  assert.equal(silence.action, 'SILENCE');
  assert.deepEqual(silence.recipients, []);
  assert.ok(audit(silence).reasonCodes.includes('MESH_NO_RECIPIENTS'));
  await ground.invalidateGround({ db, agentA: 'sender', agentB: 'a', domain: 'math',
    semanticFingerprint: REFS[0], status: 'revoked' });
  const restored = await applyAdaptiveMesh(request(db));
  assert.deepEqual(restored.recipients, ['a']);
  assert.deepEqual(audit(restored).semanticRefs, [REFS[0]]);
  const empty = await applyAdaptiveMesh(request(db, { intent: { semanticRefs: [] } }));
  assert.deepEqual(empty.recipients, RECIPIENTS,
    'absent references cannot prove that the proposed communication is already known');
}

async function noLearning(db) {
  const before = await db.get('SELECT total_changes() AS changes');
  const weights = plasticity.getAllWeights();
  const result = await applyAdaptiveMesh({ ...request(db),
    feedback: { published: true, actionTaken: true, recipientKnew: true } });
  assert.deepEqual(result.recipients, ['c', 'a', 'b']);
  assert.deepEqual(await db.get('SELECT total_changes() AS changes'), before,
    'planning and unverified feedback must not write knowledge, expertise or relation outcomes');
  assert.deepEqual(plasticity.getAllWeights(), weights);
  assert.equal(await db.get("SELECT name FROM sqlite_master WHERE name = 'communication_outcomes'"), undefined);
  assert.equal(audit(result).schemaVersion, SCHEMA_VERSION);
  assert.equal(audit(result).adaptation, 'context_adaptive');
  assert.equal(audit(result).learning, 'none');
  assert.equal(audit(result).tokenSavingsVerified, false);
}

async function withFixture(test) {
  const db = await fixture();
  try { await test(db); }
  finally { await db.close(); }
  console.log(`[PASS] ${test.name}`);
}

async function main() {
  await disabledAndConfiguration();
  for (const test of [shadowAndDeterministicFanout, scopeAndMembership, requiredAudience,
    protectedObligations, missingContext, institutionalRouting, strongerGroundingCost,
    senderAndOwner, independence, knowledgeAndGroups, noLearning]) {
    await withFixture(test);
  }
  console.log('Adaptive communication mesh: actual SQLite routing and knowledge checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
