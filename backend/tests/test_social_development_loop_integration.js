'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-development-loop-integration-test-only';
process.env.GENOS_AGOW_MODE = 'bounded';

const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const workspace = require('../src/services/globalWorkspaceService');
const relations = require('../src/services/crossAgentRelationalService');
const communicationPolicy = require('../src/services/communication/communicationPolicyEngine');
const loop = require('../src/services/socialDevelopmentLoopService');

const SCOPE = { organizationId: 'social-loop-it-org', projectId: 'social-loop-it-project' };
const SENDER = 'social-loop-it-sender';
const RECIPIENT = 'social-loop-it-recipient';
const FOREIGN = 'social-loop-it-foreign';

async function createScope(db, scope) {
  const { organizationId, projectId, workspaceId } = scope;
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', [organizationId, organizationId]);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    [projectId, organizationId, projectId]);
  await db.run(`INSERT INTO workspaces (id, name, path, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?)`, [workspaceId, workspaceId, workspaceId, organizationId, projectId]);
}

async function createAgent(db, agent) {
  const { id, workspaceId, domain } = agent;
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'worker', 'idle', 'worker', ?)`, [id, id, workspaceId]);
  await db.run(`INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration)
    VALUES (?, ?, 0.95, 0.9, 0.9)`, [id, domain]);
}

async function createWorld(db) {
  await createScope(db, { ...SCOPE, workspaceId: 'social-loop-it-workspace' });
  await createScope(db, { organizationId: 'social-loop-it-other-org',
    projectId: 'social-loop-it-other-project', workspaceId: 'social-loop-it-other-workspace' });
  await createAgent(db, { id: SENDER, workspaceId: 'social-loop-it-workspace', domain: 'bridge-repair' });
  await createAgent(db, { id: RECIPIENT, workspaceId: 'social-loop-it-workspace', domain: 'bridge-repair' });
  await createAgent(db, { id: FOREIGN, workspaceId: 'social-loop-it-other-workspace', domain: 'bridge-repair' });
  await relations.createRelation({ db, id: 'social-loop-it-valid-relation', sourceAgentId: SENDER,
    targetAgentId: RECIPIENT, relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
  await relations.createRelation({ db, id: 'social-loop-it-foreign-relation', sourceAgentId: SENDER,
    targetAgentId: FOREIGN, relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
}

function transport() {
  return { deliver: async ({ decision, envelope }) => ({ published: true, signalId: envelope.messageId,
    acknowledgements: decision.recipients.map((recipientAgentId) => ({ recipientAgentId,
      groundingLevel: 'semantic_ack', status: 'acked', evidenceHash: `receipt:${recipientAgentId}` })) }) };
}

function modelAdapter() {
  return async (request) => {
    assert.equal(request.model, 'ollama://qwen2.5:14b');
    assert.equal(request.temperature, 0);
    assert.match(request.prompt, new RegExp(RECIPIENT));
    assert.doesNotMatch(request.prompt, new RegExp(FOREIGN));
    return { structured: { action: 'contact', recipientAgentId: RECIPIENT,
      purpose: 'request', reasonCode: 'evidence-matched', memoryReferences: [] },
    usage: { prompt_tokens: 48, completion_tokens: 7 } };
  };
}

function mission() {
  return { missionId: 'social-loop-it-mission', organizationId: SCOPE.organizationId,
    projectId: SCOPE.projectId,
    socialDevelopment: { enabled: true, model: 'ollama://qwen2.5:14b', useSocialMemory: false } };
}

function observation() {
  return { eventId: 'social-loop-it-event', payload: { socialObservation: {
    id: 'social-loop-it-world-event', summary: 'A teammate needs sourced help with bridge repair.',
    domain: 'bridge-repair', evidenceRefs: ['world:social-loop-it-event'], urgency: 0.7
  } } };
}

async function runProductionLoop(db) {
  const release = workspace.configureRuntime({ agentId: SENDER, db, mode: 'bounded', ignitionThreshold: 0.1,
    primaryCapacity: 1, secondaryCapacity: 2, skipTransport: true,
    modeCosts: { ACT: 0, OBSERVE: 100, RECALL: 100, ABSTAIN: 100, VERIFY: 100 } });
  communicationPolicy.setMode('active');
  try {
    return await loop.process({ db, agentId: SENDER, event: observation(), normalizedMission: mission(),
      autonomyPlan: { executionStatus: 'ready', controlRegulation: { arbitration: { actionMode: 'act' } } },
      morphogenesisPlan: { selectedTopology: 'mycelial' }, seed: 19,
      communication: { cycleId: 'social-loop-it-cycle', transport: transport() }
    }, { generate: modelAdapter() });
  } finally { release(); }
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    await createWorld(db);
    const result = await runProductionLoop(db);
    assert.equal(result.processed, true);
    const frame = result.attention?.cycle?.frame;
    assert.ok(frame?.primaryContent?.includes('social-observation:')
      || frame?.secondaryContents?.some((entry) => entry.includes('social-observation:')));
    assert.equal(result.recipientAgentId, RECIPIENT);
    assert.equal(result.communication.delivered, true);
    assert.equal(result.communication.receipt.constraints.channelAllowed, true);
    assert.equal(result.communication.receipt.constraints.topologyAllowed, true);
    assert.equal(result.communication.receipt.outcome.deliveryConfirmed, true);
    assert.deepEqual(result.communication.receipt.executed.deliveryAcknowledgements.map((entry) => entry.recipientAgentId), [RECIPIENT]);
    const relation = await db.get('SELECT id FROM agent_relations WHERE id = ?', ['social-loop-it-valid-relation']);
    assert.ok(relation);
    const foreignRelation = await db.get('SELECT id FROM agent_relations WHERE id = ?', ['social-loop-it-foreign-relation']);
    assert.ok(foreignRelation);
    const episode = await db.get(`SELECT outcome_json AS outcomeJson FROM autobiographical_episodes
      WHERE id = ?`, [`social-loop:${SENDER}:social-loop-it-world-event`]);
    assert.ok(episode);
    assert.equal(JSON.parse(episode.outcomeJson).status, 'delivered_unverified');
    console.log('Social development production integration: SQLite scope, AGOW attention, RPE permission and receipt passed.');
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
