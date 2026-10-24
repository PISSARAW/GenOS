'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-development-loop-integration-test-only';
process.env.GENOS_AGOW_MODE = 'bounded';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getDatabase, closeDatabase } = require('../src/db');
const workspace = require('../src/services/globalWorkspaceService');
const relations = require('../src/services/crossAgentRelationalService');
const communicationPolicy = require('../src/services/communication/communicationPolicyEngine');
const loop = require('../src/services/socialDevelopmentLoopService');
const socialStore = require('../src/services/socialDevelopmentLoopStore');
const signalTransport = require('../src/services/signalingTransportService');
const grounding = require('../src/services/communication/groundingService');

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

function authorizeSocialObservation(input) {
  return { accepted: true, cycle: { frame: {
    primaryContent: `social-observation:${input.agentId}:${input.observation.id}`
  } } };
}

function mission() {
  return { missionId: 'social-loop-it-mission', organizationId: SCOPE.organizationId,
    projectId: SCOPE.projectId,
    socialDevelopment: { enabled: true, model: 'ollama://qwen2.5:14b', useSocialMemory: false } };
}

function observation(id = 'social-loop-it-world-event') {
  return { eventId: `event:${id}`, payload: { socialObservation: {
    id, summary: 'A teammate needs sourced help with bridge repair.',
    domain: 'bridge-repair', evidenceRefs: ['world:social-loop-it-event'], urgency: 0.7
  } } };
}

function durableTransport() {
  let attempts = 0;
  let publications = 0;
  const payloads = [];
  return { counts: () => ({ attempts, publications }), payloads, adapter: { deliver: async (input) => {
    attempts += 1;
    payloads.push(structuredClone(input.payload));
    const sent = await signalTransport.publishSignal({ signalId: input.envelope.messageId,
      idempotencyKey: input.idempotencyKey, signalType: 'ligand', signalData: input.payload,
      topic: input.decision.meta?.receptorTopic || 'communication',
      senderAgentId: input.intent.senderAgentId, recipientAgentIds: input.decision.recipients,
      semanticRefs: input.intent.semanticRefs, artifactRefs: input.intent.artifactRefs,
      groundingRequired: input.decision.grounding, channel: input.decision.action,
      ttlMs: input.decision.ttlMs, deliveryOnly: true, scope: input.intent.scope });
    if (sent.published && !sent.idempotentReplay) publications += 1;
    if (sent.published) await input.db.run(`UPDATE signal_deliveries SET status = 'acked',
      grounding_level = 'semantic_ack', evidence_hash = 'ack:social-loop', acked_at = CURRENT_TIMESTAMP
      WHERE signal_id = ?`, [sent.signalId]);
    const acknowledgements = sent.published
      ? await grounding.getGroundingStatus({ db: input.db, signalId: sent.signalId }) : [];
    return { published: sent.published, signalId: sent.signalId, acknowledgements };
  } } };
}

function withoutCheckpointUtility(payload) {
  const copy = structuredClone(payload);
  delete copy.content.content.utility;
  return copy;
}

async function testRetryAfterCompletionFailure(db, dbPath) {
  communicationPolicy.setMode('active');
  const durable = durableTransport();
  let completionAttempts = 0;
  const store = { ...socialStore, complete: async (targetDb, input) => {
    completionAttempts += 1;
    if (completionAttempts === 1) throw new Error('simulated-completion-failure');
    return socialStore.complete(targetDb, input);
  } };
  const input = { db, agentId: SENDER, event: observation('social-loop-retry-event'),
    normalizedMission: mission(), autonomyPlan: { executionStatus: 'ready',
      controlRegulation: { arbitration: { actionMode: 'act' } } },
    morphogenesisPlan: { selectedTopology: 'mycelial' },
    communication: { transport: durable.adapter } };
  const adapters = { generate: modelAdapter(), store, admit: authorizeSocialObservation };
  await assert.rejects(loop.process(input, adapters), /simulated-completion-failure/);
  assert.equal(durable.counts().attempts, 1, 'the first run reached the transport');
  const firstSignal = await db.get(`SELECT signal_id AS signalId FROM signal_idempotency_keys
    WHERE sender_agent_id = ? AND signal_id LIKE 'sig_idem_%'`, [SENDER]);
  assert.ok(firstSignal?.signalId);
  const idempotencyKey = JSON.stringify(['social-development', SCOPE.organizationId,
    SCOPE.projectId, SENDER, 'social-loop-retry-event']);
  await assert.rejects(signalTransport.publishSignal({ idempotencyKey,
    signalType: 'ligand', signalData: { content: 'conflicting payload' }, topic: 'checkpoint',
    senderAgentId: SENDER, recipientAgentIds: [RECIPIENT], channel: 'SIGNAL',
    deliveryOnly: true, scope: SCOPE }), /conflicting publication/);
  await db.run('UPDATE signal_blobs SET expires_at = datetime(\'now\', \'-1 second\') WHERE signal_id = ?',
    [firstSignal.signalId]);
  await signalTransport.purgeExpiredSignals();
  assert.equal(await db.get('SELECT signal_id FROM signal_blobs WHERE signal_id = ?', [firstSignal.signalId]), undefined);
  await require('../src/db').closeDatabase();
  const reopenedDb = await getDatabase(dbPath);
  const release = workspace.configureRuntime({ agentId: SENDER, db: reopenedDb, mode: 'bounded',
    ignitionThreshold: 0.1, primaryCapacity: 1, secondaryCapacity: 2, skipTransport: true,
    modeCosts: { ACT: 0, OBSERVE: 100, RECALL: 100, ABSTAIN: 100, VERIFY: 100 } });
  try {
    const result = await loop.process({ ...input, db: reopenedDb }, adapters);
    assert.equal(result.processed, true);
    assert.equal(result.communication.delivered, true);
    assert.equal(result.communication.receipt.executed.signalId, firstSignal.signalId);
    assert.deepEqual(durable.counts(), { attempts: 2, publications: 1 });
    assert.notEqual(durable.payloads[0].content.content.utility, durable.payloads[1].content.content.utility);
    assert.deepEqual(withoutCheckpointUtility(durable.payloads[0]),
      withoutCheckpointUtility(durable.payloads[1]));
    const observationRow = await reopenedDb.get(`SELECT status FROM social_development_observations
      WHERE observation_id = ?`, ['social-loop-retry-event']);
    assert.equal(observationRow.status, 'completed');
    const delivery = await reopenedDb.get(`SELECT status, grounding_level AS groundingLevel
      FROM signal_deliveries WHERE signal_id = ? AND subscriber_agent_id = ?`,
    [firstSignal.signalId, RECIPIENT]);
    assert.equal(delivery.status, 'acked', 'replay reports delivery only when the durable ACK remains');
    assert.equal(delivery.groundingLevel, 'semantic_ack');
  } finally { release(); }
  return reopenedDb;
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
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-social-idempotency-'));
  const dbPath = path.join(tempDir, 'test.sqlite');
  let db = await getDatabase(dbPath);
  try {
    await createWorld(db);
    db = await testRetryAfterCompletionFailure(db, dbPath);
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
  } finally {
    await closeDatabase();
    if (path.resolve(tempDir).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
