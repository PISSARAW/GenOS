'use strict';

const assert = require('node:assert/strict');
process.env.NODE_ENV = 'test';
process.env.GENOS_SCHEMA_MAINTENANCE = '0';
process.env.GENOS_DB_PATH = ':memory:';

const { getDatabase, closeDatabase } = require('../src/db');
const { runCycle } = require('../src/services/communication/runCycleDriver');
const { executeLiveCycle } = require('../src/services/communication/liveCycleExecution');
const { applyAdaptiveMesh } = require('../src/services/communication/adaptiveCommunicationMesh');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const { recordGrounding } = require('../src/services/communication/commonGroundService');
const organizations = require('../src/services/dynamicOrganizationService');
const { unpackSignalPayload } = require('../src/services/biomimeticSignalingBus');
const signalMetrics = require('../src/services/signalMetricsService');

const SENDER = 'mesh-sender';
const OWNER = 'mesh-owner';
const MISSION = 'mesh-runtime-mission';
const PEERS = ['mesh-peer-1', 'mesh-peer-2', 'mesh-peer-3', 'mesh-peer-4', 'mesh-peer-5'];
const REFS = ['fact:known', 'fact:fresh-1', 'fact:fresh-2'];
const NO_PROJECTED_COST = { tokenInPer1k: 0, tokenOutPer1k: 0, cognitiveWake: 0,
  fanoutPerRecipient: 0, contaminationPerUnit: 0, disclosurePerUnit: 0 };

function intentOf(extra = {}) {
  return { senderAgentId: SENDER, missionId: MISSION, purpose: 'inform', risk: 'low',
    urgency: 0.7, domain: 'mesh-runtime', requiresAction: false,
    semanticRefs: [...REFS], ...extra };
}

function optionsOf(extra = {}) {
  return { executionMode: 'live', maxCandidates: 10, dialectAvailable: false,
    coefficients: NO_PROJECTED_COST, ...extra };
}

async function addAgent(db, input) {
  await db.run(`INSERT INTO agents
    (id, name, role, status, execution_mode, workspace_id, parent_agent_id, model_tier)
    VALUES (?, ?, ?, 'idle', ?, 'mesh-space', ?, 'Flash')`,
  input.id, input.id, input.role, input.role, input.parent || null);
  if (input.member !== false) {
    await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
      MISSION, input.id, input.role);
  }
}

async function addExpert(db, agentId) {
  await db.run(`INSERT INTO agent_expertise
    (agent_id, domain, competence, calibration, reliability, freshness)
    VALUES (?, 'mesh-runtime', 0.95, 0.9, 0.9, 0.9)`, agentId);
  await recordGrounding({ db, agentA: SENDER, agentB: agentId, domain: 'mesh-runtime',
    semanticFingerprint: REFS[0], status: 'grounded', confidence: 1 });
}

async function setup() {
  const db = await getDatabase(':memory:');
  await db.run("INSERT INTO organizations (id, name) VALUES ('mesh-org', 'Mesh Org')");
  await db.run(`INSERT INTO projects (id, organization_id, name)
    VALUES ('mesh-project', 'mesh-org', 'Mesh Project')`);
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES ('mesh-space', 'Mesh Space', '/tmp/mesh-runtime', 'mesh-org', 'mesh-project')`);
  await db.run(`INSERT INTO missions (mission_id, objective, orchestrator_agent_id)
    VALUES (?, 'Exercise deterministic communication routing', ?)`, MISSION, OWNER);
  await addAgent(db, { id: OWNER, role: 'orchestrator' });
  await addAgent(db, { id: SENDER, role: 'worker', parent: OWNER });
  for (const agentId of PEERS) {
    await addAgent(db, { id: agentId, role: 'worker', parent: OWNER });
    await addExpert(db, agentId);
  }
  await organizations.ensureTables(db);
  await db.run(`INSERT INTO agent_organization_state
    (orchestrator_id, organization, policy_json, changed_by)
    VALUES (?, 'cross_functional_pod', ?, ?)`,
  OWNER, JSON.stringify(organizations.organizationProfile('cross_functional_pod')), OWNER);
  return db;
}

function captureTransport(captured) {
  return { deliver: async (input) => {
    captured.push(input);
    return { published: true, signalId: input.envelope.messageId, acknowledgements: [] };
  } };
}

async function testShadowKeepsDelivery(db) {
  const captured = [];
  const intent = intentOf();
  const result = await runCycle({ db, intent, opts: optionsOf({
    mesh: { mode: 'shadow', maxFanout: 2 }, transport: captureTransport(captured) }) });
  assert.equal(result.decision.meta.adaptiveMesh.status, 'proposed');
  assert.equal(result.decision.meta.adaptiveMesh.selectedRecipientCount, 2);
  assert.equal(result.decision.recipients.length, PEERS.length);
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0].envelope.recipientAgentIds, result.decision.recipients);
  assert.deepEqual(captured[0].payload.semanticRefs, REFS);
  assert.deepEqual(captured[0].envelope.semanticRefs, REFS);
  assert.equal(captured[0].payload.communicationMesh, undefined, 'a shadow proposal is not delivery provenance');
  assert.deepEqual(intent.semanticRefs, REFS);
  assert.equal(result.outcome.tokensUsed, null, 'an adapter without usage cannot claim zero tokens');
  assert.equal(result.outcome.grounding.satisfied, false);
  assert.equal(result.outcome.learnResult, null);
}

async function testActiveNativeDelivery(db) {
  const intent = intentOf();
  const result = await runCycle({ db, intent, opts: optionsOf({
    cycleId: 'mesh-native', mesh: { mode: 'active', maxFanout: 2 } }) });
  assert.equal(result.decision.action, 'SIGNAL');
  assert.equal(result.decision.meta.adaptiveMesh.status, 'applied');
  assert.deepEqual(result.decision.recipients, PEERS.slice(0, 2));
  assert.equal(result.decision.grounding, 'semantic_ack', 'selection must preserve required grounding');
  assert.equal(result.outcome.published, true);
  assert.equal(result.outcome.grounding.required, 'semantic_ack');
  assert.equal(result.outcome.grounding.satisfied, false, 'publication is not semantic understanding');
  const row = await db.get('SELECT signal_type, signal_blob FROM signal_blobs WHERE signal_id = ?',
    result.outcome.signalId);
  const delivered = unpackSignalPayload(row.signal_blob, row.signal_type);
  const recipients = await db.all(`SELECT subscriber_agent_id FROM signal_deliveries
    WHERE signal_id = ? ORDER BY subscriber_agent_id`, result.outcome.signalId);
  assert.deepEqual(recipients.map(item => item.subscriber_agent_id), PEERS.slice(0, 2));
  assert.deepEqual(delivered.semanticRefs, REFS.slice(1));
  assert.deepEqual(delivered.communicationEnvelope.semanticRefs, REFS.slice(1));
  assert.deepEqual(delivered.communicationEnvelope.recipientAgentIds, PEERS.slice(0, 2));
  assert.deepEqual(delivered.communicationEnvelope.scope, { organizationId: 'mesh-org',
    projectId: 'mesh-project', orchestratorId: OWNER, organizationVersion: 1 });
  assert.deepEqual(delivered.communicationMesh, {
    schemaVersion: 'genos.adaptive-communication-mesh/v1', missionId: MISSION,
    orchestratorId: OWNER, organization: 'cross_functional_pod', organizationVersion: 1 });
  assert.deepEqual(intent.semanticRefs, REFS, 'delivery must not mutate the caller intent');
  assert.equal(result.outcome.tokensUsed, 0);
  assert.equal(result.outcome.usageProvenance, 'native_transport_no_model_call');
  assert.equal(result.decision.meta.adaptiveMesh.tokenSavingsVerified, false);
}

async function testRuntimeTriggerProtectsRecipients(db) {
  const captured = [];
  const result = await runCycle({ db, intent: intentOf(), opts: optionsOf({
    trigger: 'RETRACTION', mesh: { mode: 'active', maxFanout: 1 },
    transport: captureTransport(captured) }) });
  assert.equal(result.decision.meta.adaptiveMesh.protected, true);
  assert.equal(result.decision.recipients.length, PEERS.length);
  assert.deepEqual(captured[0].envelope.semanticRefs, REFS);
}

async function testInvalidMissionCannotReachAdapter(db) {
  const captured = [];
  await addAgent(db, { id: 'mesh-outsider', role: 'worker', parent: OWNER, member: false });
  await addExpert(db, 'mesh-outsider');
  const result = await runCycle({ db, intent: intentOf({ requestedAudience: ['mesh-outsider'] }),
    opts: optionsOf({ mesh: { mode: 'active' }, transport: captureTransport(captured) }) });
  assert.equal(result.decision.action, 'SILENCE');
  assert.ok(result.decision.reasonCodes.includes('MESH_REQUIRED_RECIPIENT_DENIED'));
  assert.deepEqual(captured, []);
  assert.equal(result.outcome.published, false);
  assert.equal(result.receipt.outcome.recipientCount, 0);
}

async function testCheckpointFinalConstraints(db) {
  signalMetrics.resetMetrics();
  await db.run('INSERT INTO signal_subscriptions (subscriber_agent_id, topic) VALUES (?, ?)', SENDER, 'mesh-checkpoint');
  await db.run('INSERT INTO signal_subscriptions (subscriber_agent_id, topic) VALUES (?, ?)', PEERS[0], 'mesh-checkpoint');
  const captured = [];
  const ctx = { db, agentId: SENDER, missionId: MISSION, checkpoint: 'TOPOLOGY_TRANSITION',
    evidence: { domain: 'mesh-runtime', semanticRefs: REFS, urgency: 0.99 },
    communication: { mesh: { mode: 'active', maxFanout: 1 }, transport: captureTransport(captured) } };
  const result = await checkpoint.evaluateCheckpoint(ctx);
  assert.equal(result.decision.action, 'SIGNAL');
  assert.equal(result.decision.meta.adaptiveMesh.missionId, MISSION);
  assert.equal(result.decision.meta.adaptiveMesh.protected, true);
  assert.equal(result.executed.grounding.required, 'semantic_ack');
  assert.deepEqual(captured[0].envelope.semanticRefs, REFS);
  const used = await db.get('SELECT used FROM communication_budget_accounts WHERE agent_id = ?', SENDER);
  const denied = await checkpoint.evaluateCheckpoint({ ...ctx,
    topologySnapshot: { topologyId: 'isolated_critics', variantId: 'anonymous' },
    topologyPolicy: { variantId: 'controlled', communicationAllowed: true } });
  assert.equal(denied.decision.meta.adaptiveMesh.status, 'applied', 'mesh plan is checked by final constraints');
  assert.equal(denied.decision.action, 'SILENCE');
  assert.equal(denied.constraints.topologyReason, 'TOPOLOGY_VARIANT_MISMATCH');
  assert.equal(captured.length, 1, 'a denied plan must not reach the adapter');
  assert.deepEqual(await db.get('SELECT used FROM communication_budget_accounts WHERE agent_id = ?', SENDER), used);
}

async function testCheckpointOpaqueContent(db) {
  signalMetrics.resetMetrics();
  await db.run('DELETE FROM signal_subscriptions WHERE subscriber_agent_id = ?', SENDER);
  for (const peer of PEERS.slice(0, 2)) {
    await db.run(`INSERT INTO agent_expertise
      (agent_id, domain, competence, calibration, reliability, freshness)
      VALUES (?, 'mesh-opaque', 0.95, 0.9, 0.9, 0.9)`, peer);
    await recordGrounding({ db, agentA: SENDER, agentB: peer, domain: 'mesh-opaque',
      semanticFingerprint: REFS[0], status: 'grounded', confidence: 1 });
  }
  const captured = [];
  const ctx = { db, agentId: SENDER, missionId: MISSION, checkpoint: 'FINDING_CREATED',
    evidence: { domain: 'mesh-opaque', semanticRefs: REFS, urgency: 0.7 },
    communication: { mesh: { mode: 'active', maxFanout: 1 }, transport: captureTransport(captured) } };
  const compact = await checkpoint.evaluateCheckpoint(ctx);
  assert.equal(compact.decision.meta.adaptiveMesh.protected, false);
  assert.equal(compact.decision.recipients.length, 1);
  assert.deepEqual(captured[0].envelope.semanticRefs, REFS.slice(1));
  const opaque = await checkpoint.evaluateCheckpoint({ ...ctx, evidence: { ...ctx.evidence,
    publicSummary: 'A new finding not represented by the known references.', artifactId: 'artifact:mesh-opaque' } });
  assert.equal(opaque.decision.meta.adaptiveMesh.protected, true);
  assert.deepEqual(opaque.decision.recipients, PEERS.slice(0, 2));
  assert.deepEqual(captured[1].envelope.semanticRefs, REFS);
  assert.deepEqual(captured[1].envelope.artifactRefs, ['artifact:mesh-opaque']);
  assert.equal(captured[1].intent.payload.content.publicSummary,
    'A new finding not represented by the known references.');
}

async function plannedDecision(db, intent) {
  const decision = await applyAdaptiveMesh({ db, intent,
    decision: { action: 'SIGNAL', scope: 'SELECTIVE_MULTICAST', recipients: PEERS.slice(0, 2),
      grounding: 'semantic_ack', ttlMs: 60000, reasonCodes: [], meta: { cost: 0.05, utility: 1 } },
    options: { mode: 'active', maxFanout: 2 } });
  assert.equal(decision.action, 'SIGNAL');
  assert.equal(decision.meta.adaptiveMesh.status, 'applied');
  return decision;
}

async function assertPreflightDenies(db, intent, decision) {
  const captured = [];
  const result = await executeLiveCycle({ db, intent, decision,
    opts: { transport: captureTransport(captured) } });
  assert.equal(result.published, false);
  assert.equal(result.executed, false);
  assert.match(result.reason, /^MESH_/);
  assert.deepEqual(captured, [], 'stale permission must be rejected before adapter delivery');
}

async function testMembershipRevalidatedBeforeDelivery(db) {
  const intent = intentOf({ requestedAudience: PEERS.slice(0, 2) });
  const decision = await plannedDecision(db, intent);
  await db.run('DELETE FROM mission_agents WHERE mission_id = ? AND agent_id = ?', MISSION, PEERS[0]);
  try {
    await assertPreflightDenies(db, intent, decision);
  } finally {
    await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', MISSION, PEERS[0], 'worker');
  }
}

async function testOrganizationRevalidatedBeforeDelivery(db) {
  const intent = intentOf({ requestedAudience: PEERS.slice(0, 2) });
  const decision = await plannedDecision(db, intent);
  const original = await db.get('SELECT organization, version, policy_json FROM agent_organization_state WHERE orchestrator_id = ?', OWNER);
  await db.run(`UPDATE agent_organization_state SET organization = 'specialist_expert_committee',
    version = version + 1, policy_json = ? WHERE orchestrator_id = ?`,
  JSON.stringify(organizations.organizationProfile('specialist_expert_committee')), OWNER);
  try {
    await assertPreflightDenies(db, intent, decision);
  } finally {
    await db.run(`UPDATE agent_organization_state SET organization = ?, version = ?, policy_json = ?
      WHERE orchestrator_id = ?`, original.organization, original.version, original.policy_json, OWNER);
  }
}

async function testNativeUsesTransportDatabase(db) {
  const intent = intentOf({ requestedAudience: PEERS.slice(0, 2), semanticRefs: ['fact:native-source'] });
  const decision = await plannedDecision(db, intent);
  decision.meta.receptorTopic = 'mesh-native-source';
  let wrongDatabaseReads = 0;
  const wrongDb = { get: async () => { wrongDatabaseReads += 1; throw new Error('Wrong database'); } };
  const result = await executeLiveCycle({ db: wrongDb, intent, decision });
  assert.equal(result.published, true);
  assert.equal(wrongDatabaseReads, 0, 'native preflight must use the same database as native transport');
  const row = await db.get('SELECT signal_id FROM signal_blobs WHERE signal_id = ?', result.signalId);
  assert.equal(row.signal_id, result.signalId);
}

async function testPlanCannotChangeIntent(db) {
  const intent = intentOf({ requestedAudience: PEERS.slice(0, 2) });
  const decision = await plannedDecision(db, intent);
  for (const change of [{ domain: 'different-domain' }, { senderAgentId: OWNER }, { purpose: 'delegate' }]) {
    await assertPreflightDenies(db, { ...intent, ...change }, decision);
  }
  await assertPreflightDenies(db, intent, { ...decision, grounding: 'none' });
  await assertPreflightDenies(db, intent, { ...decision, action: 'DIALOGUE' });
}

async function main() {
  const db = await setup();
  try {
    await testShadowKeepsDelivery(db);
    await testActiveNativeDelivery(db);
    await testRuntimeTriggerProtectsRecipients(db);
    await testInvalidMissionCannotReachAdapter(db);
    await testCheckpointFinalConstraints(db);
    await testCheckpointOpaqueContent(db);
    await testMembershipRevalidatedBeforeDelivery(db);
    await testOrganizationRevalidatedBeforeDelivery(db);
    await testNativeUsesTransportDatabase(db);
    await testPlanCannotChangeIntent(db);
  } finally {
    await closeDatabase();
  }
  console.log('Adaptive mesh runtime preserves scope, grounding, final constraints and actual delivery references.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
