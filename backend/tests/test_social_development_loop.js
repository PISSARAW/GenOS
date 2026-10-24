'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const loop = require('../src/services/socialDevelopmentLoopService');
const checkpoint = require('../src/services/communication/communicationCheckpointService');
const episodes = require('../src/services/autobiographicalMemory/episodeStore');

function input(overrides = {}) {
  return {
    db: {}, agentId: 'agent-a', event: { eventId: 'observation-1', payload: { socialObservation: {
      id: 'world-event-1', summary: 'A teammate needs help with bridge repair.',
      domain: 'bridge-repair', evidenceRefs: ['world:observation-1'], urgency: 0.7
    } } },
    normalizedMission: { missionId: 'mission-1', organizationId: 'org-1', projectId: 'project-1',
      socialDevelopment: { enabled: true, model: 'ollama://qwen2.5:14b', useSocialMemory: true } },
    autonomyPlan: { executionStatus: 'ready', controlRegulation: { arbitration: { actionMode: 'act' } } },
    morphogenesisPlan: { selectedTopology: 'mycelial' }, seed: 17, ...overrides
  };
}

function adapters(log, overrides = {}) {
  return {
    agowMode: 'bounded',
    scope: async () => ({ organizationId: 'org-1', projectId: 'project-1' }),
    store: { claim: async () => ({ status: 'claimed', claimToken: 'claim-1' }),
      complete: async (_db, claim) => assert.equal(claim.claimToken, 'claim-1'),
      fail: async () => {} },
    admit: async (value) => { log.push('agow'); assert.equal(value.observation.id, 'world-event-1');
      return { accepted: true, cycle: { frame: { frameId: 'frame-1',
        primaryContent: 'social-observation:agent-a:world-event-1' } } }; },
    recipients: async () => [{ agentId: 'agent-c', role: 'worker', relationType: 'colleague',
      relationClass: 'collaborative', competence: 0.9 }],
    memories: async () => [{ id: 'episode-old', action: 'requested help', outcome: 'delivered_unverified' }],
    generate: async (request) => {
      log.push('model');
      assert.equal(request.model, 'ollama://qwen2.5:14b');
      assert.equal(request.temperature, 0);
      assert.ok(request.prompt.includes('episode-old'));
      return { structured: { action: 'contact', recipientAgentId: 'agent-c', purpose: 'request', reasonCode: 'evidence-matched' } };
    },
    communicate: async (_value, decision) => {
      log.push('rpe'); assert.equal(decision.recipientAgentId, 'agent-c');
      return { executed: { published: true, deliveryAcknowledgements: [
        { recipientAgentId: 'agent-c', status: 'acked' }
      ] }, outcome: { deliveryConfirmed: true } };
    },
    remember: async ({ communication }) => {
      log.push('memory'); assert.equal(typeof communication.delivered, 'boolean'); return { id: 'episode-new' };
    },
    learn: async ({ event }) => { log.push('learning'); assert.equal(event.payload.verifiedSocialOutcome, undefined); return { updated: false, reason: 'no-independent-evaluation' }; },
    ...overrides
  };
}

async function testFullPathOrderAndEvidence() {
  const log = [];
  const result = await loop.process(input(), adapters(log));
  assert.equal(result.processed, true);
  assert.equal(result.action, 'contact');
  assert.equal(result.recipientAgentId, 'agent-c');
  assert.equal(result.communication.delivered, true);
  assert.deepEqual(log, ['agow', 'model', 'rpe', 'memory', 'learning']);
}

async function testDisabledAndArbitrationBlocked() {
  const log = [];
  const disabled = await loop.process(input({ normalizedMission: { socialDevelopment: { enabled: false } } }), adapters(log));
  assert.equal(disabled.reason, 'social-development-disabled');
  const blocked = await loop.process(input({ autonomyPlan: { executionStatus: 'blocked' } }), adapters(log));
  assert.equal(blocked.reason, 'ontogenesis-arbitration-blocked');
  assert.deepEqual(log, []);
}

async function testOutOfGraphProposalFailsClosed() {
  const log = [];
  const deps = adapters(log, { generate: async () => ({ structured: {
    action: 'contact', recipientAgentId: 'agent-outside-scope', purpose: 'request', reasonCode: 'evidence-matched'
  } }) });
  await assert.rejects(loop.process(input(), deps), /out-of-contract/);
  assert.deepEqual(log, ['agow']);
}

async function testOutcomeIsNotInferredFromDelivery() {
  const log = [];
  const result = await loop.process(input(), adapters(log, {
    communicate: async () => ({ executed: { published: true, deliveryAcknowledgements: [] },
      outcome: { deliveryConfirmed: false } })
  }));
  assert.equal(result.communication.delivered, false);
  assert.equal(result.learning.updated, false);
}

async function testDefaultMemoryReceivesDecisionAndReceipt() {
  const log = [];
  const originalRecord = episodes.recordEpisode;
  let episodeInput;
  const cycleInput = input();
  episodes.recordEpisode = async (value, db) => {
    episodeInput = { value, db };
    return { id: 'episode-default-persistence' };
  };
  try {
    const result = await loop.process(cycleInput, adapters(log, { remember: undefined }));
    assert.equal(result.episodeId, 'episode-default-persistence');
    assert.equal(episodeInput.value.action.selectedAction, 'request:agent-c');
    assert.equal(episodeInput.value.outcome.status, 'delivered_unverified');
    assert.equal(episodeInput.value.outcome.verified, false);
    assert.equal(episodeInput.db, cycleInput.db);
  } finally {
    episodes.recordEpisode = originalRecord;
  }
}

async function testPersistedModelAuditIsCompact() {
  const log = [];
  const persisted = [];
  const deps = adapters(log, {
    store: { claim: async () => ({ status: 'claimed', claimToken: 'claim-1' }),
      complete: async (_db, claim) => persisted.push(claim.result), fail: async () => {} },
    generate: async () => ({ structured: { action: 'contact', recipientAgentId: 'agent-c',
      purpose: 'request', reasonCode: 'evidence-matched' }, provider: 'ollama',
    servedModel: 'qwen2.5:14b', text: 'FREEFORM_OUTPUT_SENTINEL',
    usage: { prompt_tokens: 31, completion_tokens: 7, total_tokens: 38,
      untrustedText: 'USAGE_TEXT_SENTINEL' }, tokenUsageMeasured: true })
  });
  const result = await loop.process(input(), deps);
  const seed = crypto.createHash('sha256').update('17:agent-a:world-event-1').digest().readUInt32LE(0);
  assert.equal(result.model, 'ollama://qwen2.5:14b');
  assert.equal(result.servedModel, 'qwen2.5:14b');
  assert.equal(result.modelSeed, seed);
  assert.deepEqual(result.modelUsage, { provider: 'ollama', servedModel: 'qwen2.5:14b',
    inputTokens: 31, outputTokens: 7, totalTokens: 38, measured: true });
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].modelSeed, seed);
  assert.deepEqual(persisted[0].modelUsage, result.modelUsage);
  const serialized = JSON.stringify(persisted[0]);
  assert.equal(serialized.includes('FREEFORM_OUTPUT_SENTINEL'), false);
  assert.equal(serialized.includes('USAGE_TEXT_SENTINEL'), false);
  assert.equal(Object.hasOwn(persisted[0], 'prompt'), false);
  assert.equal(Object.hasOwn(persisted[0], 'text'), false);
}

function testCheckpointHonorsModelRecipientAsHint() {
  const intent = checkpoint.buildIntent({ agentId: 'agent-a', checkpoint: 'NEW_EVIDENCE',
    evidence: { domain: 'bridge-repair', requestedAudience: ['agent-c', 'agent-c'], purpose: 'request' } });
  assert.deepEqual(intent.requestedAudience, ['agent-c']);
  assert.equal(intent.purpose, 'request');
}

async function main() {
  await testFullPathOrderAndEvidence();
  await testDisabledAndArbitrationBlocked();
  await testOutOfGraphProposalFailsClosed();
  await testOutcomeIsNotInferredFromDelivery();
  await testDefaultMemoryReceivesDecisionAndReceipt();
  await testPersistedModelAuditIsCompact();
  testCheckpointHonorsModelRecipientAsHint();
  console.log('Social Development Loop causal handoff, arbitration, RPE audience, and evidence gates: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
