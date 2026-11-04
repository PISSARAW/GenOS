'use strict';

const assert = require('node:assert/strict');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const policy = require('../src/services/communication/communicationPolicyEngine');
const { applyAdaptiveMesh } = require('../src/services/communication/adaptiveCommunicationMesh');
const { organizationProfile } = require('../src/services/dynamicOrganizationService');
const { applyTopologyConstraints } = require('../src/services/communication/communicationDecisionContext');
const manifest = require('../src/services/communication/communicationManifestService');
const expertise = require('../src/services/communication/transactiveMemoryService');
const ground = require('../src/services/communication/commonGroundService');

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateIntent = ajv.compile(require('../../spec/communication-intent.schema.json'));
const validateDecision = ajv.compile(require('../../spec/communication-decision.schema.json'));

function accepted(validate, value) {
  assert.equal(validate(value), true, JSON.stringify(validate.errors));
}

function rejected(validate, value) {
  assert.equal(validate(value), false, 'invalid contract must be rejected');
}

function actualIntent(extra = {}) {
  return checkpoint.buildIntent({ agentId: 'sender', missionId: 'mission', checkpoint: 'NEW_EVIDENCE',
    scope: { organizationId: 'org', projectId: 'project' }, evidence: {
      domain: 'math', urgency: 0.75, semanticRefs: ['proof:one', 'mission:mission:changed'] }, ...extra });
}

function intentContracts() {
  accepted(validateIntent, actualIntent());
  const legacy = checkpoint.buildIntent({ agentId: 'sender', checkpoint: 'MISSION_COMPLETED' });
  accepted(validateIntent, legacy);
  assert.equal(legacy.requestedAudience, null);
  assert.equal(legacy.missionId, null);
  const complete = actualIntent({ evidence: { domain: 'math', semanticRefs: ['sha256:canonical-id'],
    artifactId: 'artifact:one', publicSummary: 'Un résultat nouveau.', requestedAudience: ['a'] } });
  accepted(validateIntent, complete);
  accepted(validateIntent, { ...complete, scope: { ...complete.scope, orchestratorId: 'owner', organizationVersion: 1 },
    communicationMesh: { schemaVersion: 'genos.adaptive-communication-mesh/v1', missionId: 'mission',
      orchestratorId: 'owner', organization: 'cross_functional_pod', organizationVersion: 1 } });
  for (const change of [{ semanticRefs: [''] }, { semanticRefs: ['   '] }, { semanticRefs: [1] },
    { missionId: 1 }, { checkpoint: false }, { scope: [] }, { requestedAudience: 'a' },
    { artifactRefs: [null] }, { retraction: 'true' }, { independenceThreshold: 2 }]) {
    rejected(validateIntent, { ...complete, ...change });
  }
}

async function fixture() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`CREATE TABLE workspaces (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE agents (id TEXT PRIMARY KEY, role TEXT, parent_agent_id TEXT, execution_mode TEXT,
      status TEXT, workspace_id TEXT, model_tier TEXT);
    CREATE TABLE missions (mission_id TEXT PRIMARY KEY, orchestrator_agent_id TEXT);
    CREATE TABLE mission_agents (mission_id TEXT, agent_id TEXT);
    CREATE TABLE agent_organization_state (orchestrator_id TEXT PRIMARY KEY, organization TEXT,
      version INTEGER, policy_json TEXT);
    CREATE TABLE agent_relations (id TEXT PRIMARY KEY, source_agent_id TEXT, target_agent_id TEXT,
      relation_type TEXT, relation_class TEXT, metadata_json TEXT, organization_id TEXT,
      project_id TEXT, updated_at TEXT);
    INSERT INTO workspaces VALUES ('home', 'org', 'project');
    INSERT INTO missions VALUES ('mission', 'owner');
    INSERT INTO agents VALUES ('owner', 'orchestrator', NULL, 'orchestrator', 'active', 'home', 'Flash');
    INSERT INTO mission_agents VALUES ('mission', 'owner');`);
  for (const id of ['sender', 'a', 'b']) {
    await db.run('INSERT INTO agents VALUES (?, ?, ?, ?, ?, ?, ?)', id, 'worker', 'owner', 'worker', 'active', 'home', 'Flash');
    await db.run('INSERT INTO mission_agents VALUES (?, ?)', 'mission', id);
  }
  await db.run('INSERT INTO agent_organization_state VALUES (?, ?, ?, ?)', 'owner', 'cross_functional_pod', 1,
    JSON.stringify(organizationProfile('cross_functional_pod')));
  await expertise.ensureTables(db);
  await ground.ensureTables(db);
  for (const id of ['a', 'b']) {
    await db.run(`INSERT INTO agent_expertise
      (agent_id, domain, competence, calibration, reliability, freshness) VALUES (?, 'math', 0.9, 1, 1, 1)`, id);
  }
  return db;
}

async function meshContracts(db, intent, proposed) {
  const input = { db, intent, decision: proposed, options: { mode: 'active', maxFanout: 1 } };
  const active = await applyAdaptiveMesh(input);
  assert.equal(active.action, 'SIGNAL');
  assert.equal(active.meta.adaptiveMesh.status, 'applied');
  accepted(validateDecision, active);
  const shadow = await applyAdaptiveMesh({ ...input, options: { mode: 'shadow', maxFanout: 1 } });
  assert.equal(shadow.meta.adaptiveMesh.status, 'proposed');
  accepted(validateDecision, shadow);
  for (const mode of ['active', 'shadow']) {
    const blocked = await applyAdaptiveMesh({ ...input, intent: { ...intent, missionId: null },
      options: { mode, maxFanout: 1 } });
    assert.equal(blocked.meta.adaptiveMesh.status, 'blocked');
    accepted(validateDecision, blocked);
  }
  invalidDecisions(active);
  await knownReferenceSilence(db, input);
}

function invalidDecisions(active) {
  for (const change of [{ mode: 'automatic' }, { maxFanout: 0 }, { maxFanout: 9 }, { maxFanout: '3' },
    { status: 'verified' }, { learning: 'verified' }, { semanticRefs: [123] },
    { tokenSavingsVerified: true }, { planFingerprint: 'sha256:unverified' }]) {
    rejected(validateDecision, { ...active, meta: { ...active.meta,
      adaptiveMesh: { ...active.meta.adaptiveMesh, ...change } } });
  }
  for (const change of [{ ttlMs: 0 }, { ttlMs: -1 }, { recipients: 'a' },
    { meta: 'opaque' }, { reasonCodes: ['unknown'] }]) {
    rejected(validateDecision, { ...active, ...change });
  }
}

async function knownReferenceSilence(db, input) {
  for (const receiverId of input.decision.recipients) {
    for (const semanticFingerprint of input.intent.semanticRefs) {
      await ground.recordGrounding({ db, agentA: 'sender', agentB: receiverId, domain: 'math',
        semanticFingerprint, status: 'grounded', confidence: 1 });
    }
  }
  const silence = await applyAdaptiveMesh(input);
  assert.equal(silence.action, 'SILENCE');
  assert.equal(silence.ttlMs, 0);
  accepted(validateDecision, silence);
  rejected(validateDecision, { ...silence, ttlMs: -1 });
}

async function existingConstraints(db, proposed) {
  const topology = applyTopologyConstraints({ topology: { policy: { communicationAllowed: false } } }, proposed, 'SIGNAL');
  accepted(validateDecision, topology.decision);
  assert.ok(topology.decision.reasonCodes.includes('TOPOLOGY_COMMUNICATION_DENIED'));
  const channel = manifest.enforceManifestChannel({ allowedChannels: [] }, proposed);
  accepted(validateDecision, channel.decision);
  assert.ok(channel.decision.reasonCodes.includes('CHANNEL_NOT_ALLOWED'));
  const budget = await manifest.enforceManifestBudget({ db, decision: proposed,
    manifest: { agentId: 'sender', communicationBudget: { total: 0, used: 0 } } });
  accepted(validateDecision, budget.decision);
  assert.ok(budget.decision.reasonCodes.includes('COMMUNICATION_BUDGET_EXHAUSTED'));
}

async function main() {
  intentContracts();
  const db = await fixture();
  const previousMode = policy.getMode();
  try {
    policy.setMode('active');
    const intent = actualIntent();
    const proposed = await policy.decideCommunication({ db, intent });
    assert.equal(proposed.action, 'SIGNAL');
    accepted(validateDecision, proposed);
    await existingConstraints(db, proposed);
    await meshContracts(db, intent, proposed);
    const silent = await policy.decideCommunication({ db, intent: { ...intent, urgency: 0.01 } });
    assert.equal(silent.action, 'SILENCE');
    accepted(validateDecision, silent);
  } finally {
    policy.setMode(previousMode);
    await db.close();
  }
  console.log('[PASS] AJV2020 validates runtime intents, policy constraints and active/shadow/silent mesh decisions.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
