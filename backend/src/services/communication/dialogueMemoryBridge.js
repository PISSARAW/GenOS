'use strict';

const episodes = require('../autobiographicalMemory/episodeStore');

function evidenceRefsOf(content) {
  if (!Array.isArray(content.evidenceRefs)) return [];
  return [...new Set(content.evidenceRefs.filter((ref) => typeof ref === 'string' && ref.trim()))];
}

function summaryOf(content) {
  return typeof content.summary === 'string' ? content.summary.trim().slice(0, 1000) : '';
}

function episodeForParticipant(input, agentId) {
  const { session, artifact } = input;
  const refs = [...evidenceRefsOf(artifact.content),
    ...session.turns.map((turn) => `dialogue:${session.id}:turn:${turn.seq}`)];
  return { agentId, missionId: session.id, organizationId: input.organizationId || null,
    projectId: input.projectId || null, kind: 'social_dialogue', salience: 0.8,
    situation: { goal: session.unresolvedQuestion, context: { domain: session.domain } },
    decision: { selectedStrategy: 'bounded-dialogue' },
    action: { selectedAction: summaryOf(artifact.content) },
    outcome: { status: 'resolved_dialogue', artifactKind: artifact.kind, evidenceRefs: refs } };
}

async function captureResolvedDialogue(input) {
  if (input.session.status !== 'resolved' || input.artifact.kind === 'UNRESOLVED') {
    return { captured: false, reason: 'dialogue-not-resolved' };
  }
  if (!input.organizationId || !input.projectId) return { captured: false, reason: 'scope-required' };
  const summary = summaryOf(input.artifact.content);
  const evidenceRefs = evidenceRefsOf(input.artifact.content);
  if (!summary || evidenceRefs.length === 0) return { captured: false, reason: 'artifact-evidence-incomplete' };
  const recorded = [];
  for (const agentId of input.session.participants) {
    const episode = episodeForParticipant({ ...input, organizationId: input.organizationId,
      projectId: input.projectId }, agentId);
    recorded.push(await episodes.recordEpisode(episode, input.db));
  }
  return { captured: true, episodeIds: recorded.map((episode) => episode.id) };
}

module.exports = { captureResolvedDialogue, evidenceRefsOf, episodeForParticipant };
