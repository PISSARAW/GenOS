'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-runtime-source-evidence-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/socialMentalModelRuntimeService');
const dialogue = require('../src/services/communication/dialogueSessionService');
const verbal = require('../src/services/communication/verbalEscalationService');
const { digest } = require('../src/services/biologicalIntegrity');

const scope = { organizationId: 'runtime-evidence-org', projectId: 'runtime-evidence-project' };
const participants = ['agent-a', 'agent-b'];

async function openDialogue(db, index) {
  const escalation = await verbal.requestEscalation({ db, trigger: 'AMBIGUOUS_INTENT', participants,
    domain: 'collaboration', unresolvedQuestion: `How should agents coordinate observation ${index}?` });
  await verbal.markMicroExhausted({ db, escalationId: escalation.id, outcome: 'failed' });
  return dialogue.openDialogue({ db, escalationId: escalation.id, tokenBudget: 500, maxTurns: 2,
    requiredArtifact: 'ExperimentProposal' });
}

async function closeDialogue(db, session, index) {
  const turns = [
    { speaker: participants[0], utterance: `Agent B demonstrated reliable behavior ${index}.` },
    { speaker: participants[1], utterance: `I confirm the observation for case ${index}.` },
  ];
  for (const turn of turns) await dialogue.appendTurn({ db, escalationId: session.id, ...turn, tokensUsed: 12 });
  const evidenceRefs = turns.map((_, i) => `dialogue:${session.id}:turn:${i + 1}`);
  const modelTurnReceipts = turns.map((turn, i) => ({ seq: i + 1, provider: 'ollama', servedModel: 'test-model',
    invocationId: `00000000-0000-4000-8000-0000000000${String(index)}${String(i + 1)}`,
    promptHash: digest(`prompt-${index}-${i}`), contentHash: digest(turn.utterance) }));
  await dialogue.closeSession({ db, escalationId: session.id, artifactKind: 'ExperimentProposal',
    artifact: { summary: `Resolved observation ${index}`, evidenceRefs,
      socialObservation: { relationType: 'reliable', polarity: index < 3 ? 'supports' : 'contradicts',
        statement: `Observation ${index} describes reliability.`, evidenceRefs }, modelTurnReceipts }, ...scope });
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    const evidence = [];
    for (let index = 0; index < 4; index += 1) {
      const session = await openDialogue(db, index);
      await closeDialogue(db, session, index);
      evidence.push(await runtime.recordVerifiedSocialMemory(db, { ...scope,
        subjectAgentId: participants[0], otherAgentId: participants[1], sessionId: session.id }));
    }
    for (const item of evidence) {
      assert.equal(item.persisted, true);
      assert.equal(item.readBack, true);
      assert.equal(item.memoryHash, digest(item.memory));
      assert.equal(item.receiptHash, digest(item.receipt));
      assert.equal(item.sourceEventHash, digest(item.sourceEvent));
      assert.equal(item.receipt.receiptId, item.receiptId);
      assert.equal(item.participantEpisodes.length, 2);
      assert.equal(new Set(item.participantEpisodes.map((episode) => episode.id)).size, 2);
      assert.deepEqual(item.receipt.episodeIds, item.participantEpisodes.map((episode) => episode.id));
      assert.deepEqual(item.receipt.episodeHashes, item.participantEpisodes.map((episode) => digest(episode)));
    }
    const loaded = await runtime.loadVerifiedSocialMemories(db, { ...scope,
      subjectAgentId: participants[0], otherAgentId: participants[1],
      requiredPolarityCounts: { supports: 3, contradicts: 1 } });
    assert.equal(loaded.socialMemories.length, 4);
    const intervention = await runtime.createPersistedSocialMemoryIntervention(db, { ...scope,
      subjectAgentId: participants[0], otherAgentId: participants[1], interventionId: 'r2-policy-check',
      arm: 'genos-full', seed: 'r2-policy-check', mode: 'baseline', selectedMemoryIds: [],
      minimumIndependentMemories: 4, requiredPolarityCounts: { supports: 3, contradicts: 1 } });
    assert.deepEqual(intervention.artifact.requiredPolarityCounts, { supports: 3, contradicts: 1 });
    const interventionReplay = await runtime.verifyPersistedSocialMemoryIntervention(db, { ...scope,
      interventionId: 'r2-policy-check' });
    assert.equal(interventionReplay.valid, true);
    await assert.rejects(runtime.loadVerifiedSocialMemories(db, { ...scope,
      subjectAgentId: participants[0], otherAgentId: participants[1],
      requiredPolarityCounts: { supports: 2, contradicts: 2 } }), { code: 'SOCIAL_MEMORY_INDEPENDENCE_REQUIRED' });
    console.log('Social runtime source evidence: complete offline artifact payloads replay against persisted rows.');
  } finally { await closeDatabase(); }
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
