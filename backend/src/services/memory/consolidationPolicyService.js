/**
 * Consolidation Policy Service
 * Decides when and how to consolidate episodic memories into
 * semantic, procedural, or negative knowledge.
 */

const crypto = require('crypto');

const CONSOLIDATION_THRESHOLD = 0.7;
const REPETITION_THRESHOLD = 3;
const NEGATIVE_THRESHOLD = 0.3;

function countPatternOccurrences(pattern, episodes) {
  if (!pattern || !Array.isArray(episodes)) return 0;
  let count = 0;
  for (const ep of episodes) {
    const text = `${ep.actionType || ''} ${ep.actionInput || ''} ${ep.observationOutput || ''}`.toLowerCase();
    if (text.includes(String(pattern).toLowerCase())) count++;
  }
  return count;
}

function shouldConsolidate(memoryEntry) {
  if (!memoryEntry) return false;
  if (memoryEntry.isConsolidated) return false;
  const reward = Number(memoryEntry.rewardScore || 0);
  if (reward < CONSOLIDATION_THRESHOLD) return false;
  const episodes = memoryEntry.episodes || [];
  const pattern = memoryEntry.actionType || memoryEntry.pattern;
  const occurrences = countPatternOccurrences(pattern, episodes);
  return occurrences >= REPETITION_THRESHOLD;
}

function promoteToSemantic(episode) {
  if (!episode) return null;
  return {
    id: `sem_${crypto.randomUUID()}`,
    title: episode.title || `Semantic: ${episode.actionType || 'knowledge'}`,
    content: episode.observationOutput || episode.content || '',
    category: 'semantic',
    source: 'consolidation',
    sourceEpisodeId: episode.id || null,
    provenance: {
      promotedFrom: 'episodic',
      originalEpisodeId: episode.id || null,
      promotedAt: new Date().toISOString()
    },
    synapticWeight: 1.0
  };
}

function promoteToProcedural(episode) {
  if (!episode) return null;
  return {
    id: `proc_${crypto.randomUUID()}`,
    title: episode.title || `Procedural: ${episode.actionType || 'procedure'}`,
    content: episode.actionInput || '',
    trajectory: episode.trajectory || [episode.actionType || 'step'],
    category: 'procedural',
    source: 'consolidation',
    sourceEpisodeId: episode.id || null,
    provenance: {
      promotedFrom: 'episodic',
      originalEpisodeId: episode.id || null,
      promotedAt: new Date().toISOString()
    },
    synapticWeight: 1.0
  };
}

function markAsNegativeKnowledge(episode) {
  if (!episode) return null;
  return {
    id: `neg_${crypto.randomUUID()}`,
    title: episode.title || `Negative: ${episode.actionType || 'dead end'}`,
    content: episode.observationOutput || episode.content || '',
    category: 'negative',
    source: 'consolidation',
    sourceEpisodeId: episode.id || null,
    provenance: {
      promotedFrom: 'episodic',
      originalEpisodeId: episode.id || null,
      promotedAt: new Date().toISOString()
    },
    synapticWeight: 0.5,
    isNegative: true
  };
}

function classifyForConsolidation(episode, allEpisodes) {
  if (!episode) return { action: 'skip', reason: 'no_episode' };
  const reward = Number(episode.rewardScore || 0);
  if (reward < NEGATIVE_THRESHOLD) {
    return { action: 'negative', entry: markAsNegativeKnowledge(episode) };
  }
  const pattern = episode.actionType || '';
  const occurrences = countPatternOccurrences(pattern, allEpisodes);
  if (occurrences >= REPETITION_THRESHOLD && reward >= CONSOLIDATION_THRESHOLD) {
    return { action: 'procedural', entry: promoteToProcedural(episode) };
  }
  if (reward >= CONSOLIDATION_THRESHOLD) {
    return { action: 'semantic', entry: promoteToSemantic(episode) };
  }
  return { action: 'skip', reason: 'below_threshold' };
}

module.exports = {
  CONSOLIDATION_THRESHOLD,
  REPETITION_THRESHOLD,
  NEGATIVE_THRESHOLD,
  shouldConsolidate,
  promoteToSemantic,
  promoteToProcedural,
  markAsNegativeKnowledge,
  classifyForConsolidation
};
