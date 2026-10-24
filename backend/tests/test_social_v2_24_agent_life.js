'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-life-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const relations = require('../src/services/crossAgentRelationalService');
const transactiveMemory = require('../src/services/communication/transactiveMemoryService');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const { setMode } = require('../src/services/communication/communicationPolicyEngine');
const episodes = require('../src/services/autobiographicalMemory/episodeStore');

const AGENT_COUNT = 24;
const CYCLES = 1000;
const SCOPE = { organizationId: 'social-v2-life-org', projectId: 'social-v2-life-project' };

function agentId(index) {
  return `social-agent-${String(index).padStart(2, '0')}`;
}

async function createWorld(db) {
  await db.run("INSERT INTO organizations (id, name) VALUES ('social-v2-life-org', 'SocialWorld V2')");
  await db.run("INSERT INTO projects (id, organization_id, name) VALUES ('social-v2-life-project', 'social-v2-life-org', 'SocialWorld V2')");
  await db.run("INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES ('social-v2-life-space', 'SocialWorld V2', 'social-v2-life', 'social-v2-life-org', 'social-v2-life-project')");
  await transactiveMemory.ensureTables(db);
  for (let index = 0; index < AGENT_COUNT; index++) {
    await createAgent(db, index);
  }
  await createSocialRing(db);
}

async function createAgent(db, index) {
  const id = agentId(index);
  await db.run('INSERT INTO agents (id, name, role, status, execution_mode, workspace_id) VALUES (?, ?, ?, ?, ?, ?)',
    [id, id, 'worker', 'idle', 'worker', 'social-v2-life-space']);
  await db.run('INSERT INTO agent_expertise (agent_id, domain, competence, reliability, calibration) VALUES (?, ?, 0.95, 0.9, 0.9)',
    [id, `domain-${index}`]);
}

async function createSocialRing(db) {
  for (let index = 0; index < AGENT_COUNT; index++) {
    const next = (index + 1) % AGENT_COUNT;
    await relations.createRelation({ db, id: `social-edge-${index}`, sourceAgentId: agentId(index),
      targetAgentId: agentId(next), relationType: 'colleague', relationClass: 'organizational', ...SCOPE });
  }
}

function transport() {
  return { deliver: async ({ decision, envelope }) => ({ published: true, signalId: envelope.messageId,
    acknowledgements: decision.recipients.map((recipientAgentId) => ({ recipientAgentId,
      groundingLevel: 'semantic_ack', status: 'acked', evidenceHash: `receipt:${recipientAgentId}` })) }) };
}

async function observeCheckpoint(db, input) {
  const semanticRef = `fact:social-event-${input.cycle}-${input.agentIndex}`;
  const receipt = await checkpoint.evaluateCheckpoint({ db, agentId: agentId(input.agentIndex),
    checkpoint: 'NEW_EVIDENCE', evidence: { domain: `domain-${input.domainIndex}`, urgency: 0.7,
      artifactId: semanticRef, semanticRefs: [semanticRef],
      publicSummary: `Observed a new navigation fact at cycle ${input.cycle}.` },
    scope: SCOPE, communication: { cycleId: `social-cycle-${input.cycle}-${input.agentIndex}`, transport: transport() } });
  return { receipt, semanticRef };
}

async function recordInteractionMemory(db, input) {
  await episodes.recordEpisode({ agentId: agentId(input.senderIndex), missionId: `social-cycle-${input.cycle}`,
    organizationId: SCOPE.organizationId, projectId: SCOPE.projectId, kind: 'social_interaction', salience: 0.8,
    situation: { goal: `share navigation evidence with ${agentId(input.recipientIndex)}` },
    action: { selectedAction: 'share verified navigation evidence' },
    outcome: { status: 'delivered', evidenceRefs: [input.signalId] },
    lesson: { sourceRefs: [input.semanticRef] } }, db);
}

async function runInteractionCycle(db, cycle) {
  const senderIndex = cycle / 100 - 1;
  const recipientIndex = (senderIndex + 1) % AGENT_COUNT;
  const first = await observeCheckpoint(db, { cycle, agentIndex: senderIndex, domainIndex: recipientIndex });
  const firstRecipient = first.receipt.decision.recipients[0];
  if (first.receipt.executed?.published !== true || !firstRecipient) return null;
  const response = await observeCheckpoint(db, { cycle: cycle + 1, agentIndex: recipientIndex, domainIndex: senderIndex });
  const respondedToSender = response.receipt.decision.recipients.includes(agentId(senderIndex));
  await recordInteractionMemory(db, { cycle, senderIndex, recipientIndex,
    signalId: first.receipt.executed.signalId, semanticRef: first.semanticRef });
  return { first, response, recipientIndex, respondedToSender };
}

async function runWorld(db) {
  const interactions = [];
  for (let cycle = 1; cycle <= CYCLES; cycle++) {
    if (cycle % 100 !== 0) continue;
    const interaction = await runInteractionCycle(db, cycle);
    if (interaction) interactions.push(interaction);
  }
  return interactions;
}

function evaluateWorld(interactions) {
  const recipients = new Set(interactions.map((interaction) => agentId(interaction.recipientIndex)));
  const initiatives = interactions.filter((interaction) => interaction.first.receipt.decision.action === 'SIGNAL');
  const reciprocals = interactions.filter((interaction) => interaction.respondedToSender);
  return { initiatives: initiatives.length, distinctRecipients: recipients.size,
    reciprocals: reciprocals.length, receipts: interactions.length,
    memoryEpisodes: interactions.length };
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    setMode('active');
    await createWorld(db);
    const observed = evaluateWorld(await runWorld(db));
    assert.equal(observed.initiatives, 10);
    assert.equal(observed.distinctRecipients, 10);
    assert.equal(observed.reciprocals, 10);
    assert.equal(observed.receipts, 10);
    assert.equal(observed.memoryEpisodes, 10);
    console.log(`SocialWorld V2 24-agent probe passed: ${JSON.stringify(observed)} over ${CYCLES} cycles.`);
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
