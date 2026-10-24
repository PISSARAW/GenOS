'use strict';

process.env.GENOS_ADMIN_PASSWORD ||= 'social-v2-dialogue-memory-test-only';
const assert = require('node:assert/strict');
const { getDatabase, closeDatabase } = require('../src/db');
const episodes = require('../src/services/autobiographicalMemory/episodeStore');
const recall = require('../src/services/autobiographicalMemory/recallService');
const verbal = require('../src/services/communication/verbalEscalationService');
const dialogue = require('../src/services/communication/dialogueSessionService');

const SCOPE = { organizationId: 'social-v2-dialogue-org', projectId: 'social-v2-dialogue-project' };

async function openFourTurnDialogue(db) {
  const escalation = await verbal.requestEscalation({ db, trigger: 'AMBIGUOUS_INTENT',
    participants: ['agent-a', 'agent-b'], domain: 'navigation',
    unresolvedQuestion: 'How should the team share the verified navigation map?' });
  await verbal.markMicroExhausted({ db, escalationId: escalation.id, outcome: 'failed' });
  const session = await dialogue.openDialogue({ db, escalationId: escalation.id,
    tokenBudget: 500, maxTurns: 4, requiredArtifact: 'Commitment' });
  for (const turn of [
    { speaker: 'agent-a', utterance: 'Can you share the route map with the team?' },
    { speaker: 'agent-b', utterance: 'Yes, I can share the verified copy.' },
    { speaker: 'agent-a', utterance: 'Please include the source reference.' },
    { speaker: 'agent-b', utterance: 'I will attach receipt map-17.' }
  ]) await dialogue.appendTurn({ db, escalationId: session.id, ...turn, tokensUsed: 20 });
  return session.id;
}

async function closeWithCommitment(db, escalationId) {
  return dialogue.closeSession({ db, escalationId, artifactKind: 'Commitment',
    artifact: { summary: 'A and B agree to share the verified navigation map.',
      evidenceRefs: ['receipt:map-17'] }, ...SCOPE });
}

async function assertParticipantMemory(db, agentId, sessionId) {
  const stored = await episodes.getRecentEpisodes({ agentId, organizationId: SCOPE.organizationId,
    projectId: SCOPE.projectId, missionId: sessionId, kind: 'social_dialogue' }, db);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].outcome.status, 'resolved_dialogue');
  assert.ok(stored[0].outcome.evidenceRefs.includes('receipt:map-17'));
  assert.equal(stored[0].outcome.evidenceRefs.length, 5);
  const recalled = await recall.recallForSituation({ agentId, organizationId: SCOPE.organizationId,
    projectId: SCOPE.projectId, missionId: 'future-mission', kind: 'social_dialogue',
    goal: 'share the verified navigation map' }, {}, db);
  assert.match(recalled.summary, /agree to share the verified navigation map/);
}

async function main() {
  const db = await getDatabase(':memory:');
  try {
    const sessionId = await openFourTurnDialogue(db);
    const resolved = await closeWithCommitment(db, sessionId);
    assert.equal(resolved.status, 'resolved');
    assert.equal(resolved.turns.length, 4);
    await assertParticipantMemory(db, 'agent-a', sessionId);
    await assertParticipantMemory(db, 'agent-b', sessionId);
    console.log('SocialWorld V2 dialogue closure created scoped, reference-linked memories for both participants.');
  } finally {
    await closeDatabase();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
