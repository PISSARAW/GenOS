'use strict';

const store = require('./storage');

async function provenance(db, episode) {
  const owner = episode.agentId || 'orchestrator';
  if (!episode.inheritedFromEpisodeId) {
    const decision = await ownDecision(db, episode);
    if (decision) return { kind: 'experienced', recordedFor: owner, experiencedBy: owner,
      evidenceClass: 'runtime_attested_decision', decisionId: decision.decision_id,
      evidenceHash: decision.self_head, sourceEpisodeId: null };
    return { kind: 'reported', recordedFor: owner, experiencedBy: owner,
      evidenceClass: 'runtime_report', sourceEpisodeId: null };
  }
  const source = await db.get('SELECT * FROM autobiographical_episodes WHERE id = ?', episode.inheritedFromEpisodeId);
  if (!source || source.agent_id === owner) store.fail('IDENTITY_INHERITED_EPISODE_INVALID');
  const target = await store.registration(db, { agentId: owner });
  await store.registration(db, { agentId: source.agent_id, scope: target.scope });
  const sourceProvenance = read(source);
  return { kind: 'inherited', recordedFor: owner, experiencedBy: sourceProvenance.experiencedBy,
    evidenceClass: 'source_episode', sourceEvidenceClass: sourceProvenance.evidenceClass, sourceEpisodeId: source.id };
}

async function ownDecision(db, episode) {
  if (!episode.missionId || !await store.table(db, 'agent_identity_decisions')) return null;
  return db.get(`SELECT * FROM agent_identity_decisions WHERE decision_id = ?
    AND agent_id = ? AND attribution = 'self' AND outcome IS NOT NULL`, `worker:${episode.missionId}`, episode.agentId);
}

function isInherited(episode) { return episode.provenance?.kind === 'inherited'; }

function read(row) {
  let situation;
  try { situation = JSON.parse(row.situation_json || '{}'); } catch (_) { situation = {}; }
  return situation._genosExperience || { kind: 'legacy_report', recordedFor: row.agent_id,
    experiencedBy: null, evidenceClass: 'unknown', sourceEpisodeId: null };
}

module.exports = { provenance, read, isInherited };
