/**
 * GenOS Agent Memory Prompt Builder (N11)
 * Reads cognitive memories and renders the prompt block injected at runtime.
 * - Read failures are telemetered (MEMORY_READ_FAILED) and degrade to empty
 *   collections / '' instead of null: the only caller of
 *   retrieveAgentMemories destructures the result, and agentRuntimeAdapter
 *   treats a falsy prompt as "no memory" — '' is the safe historical shape.
 * - `[UNVERIFIED_EVIDENCE]` / `UnverifiedExperience` records are filtered
 *   out at read time and are NEVER injected into prompts.
 * - Vesicles are peeked first; the destructive consume only runs after the
 *   prompt block was assembled successfully (see agentMemoryVesicles).
 */

const { readFailed } = require('./agentMemoryTelemetry');
const vesicles = require('./agentMemoryVesicles');

function truncateWords(text, maxLen) {
  const str = String(text || '').trim();
  const limit = maxLen || 250;
  if (str.length <= limit) return str;
  const cut = str.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > limit * 0.7 ? cut.slice(0, lastSpace) : cut) + '...';
}

function notIgnoranceOrFailure(item) {
  return item.id !== 'signal_ignorance' && item.status !== 'FAILURE';
}

function similarEnough(record) {
  return !record.similarity || record.similarity >= 0.35;
}

function toPitfall(record) {
  return { summary: `${record.title}: ${record.content}`, status: 'FAILURE', category: 'Failure' };
}

function highReward(episode) {
  return Number(episode.rewardScore) >= 0.7;
}

function isVerifiedMemory(item) {
  if (!item) return false;
  if (item.category === 'UnverifiedExperience') return false;
  const text = item.content || item.summary || '';
  return String(text).indexOf('[UNVERIFIED_EVIDENCE]') === -1;
}

function filterUnverified(list) {
  const items = Array.isArray(list) ? list : [];
  return items.filter(isVerifiedMemory);
}

async function searchExperiences(agentId, task, opts) {
  try {
    const vectorMemory = require('./vectorMemoryService');
    const res = await vectorMemory.searchMemory(task, { ...opts, limit: opts.limit || 5, ownerId: agentId });
    return {
      experiences: (res.allScoredExperiences || []).filter(notIgnoranceOrFailure),
      pitfalls: res.pitfallsToAvoid || [],
      goldenPaths: res.topSuccessfulGoldenPaths || []
    };
  } catch (error) {
    readFailed(agentId, error, 'memory-search');
    return { experiences: [], pitfalls: [], goldenPaths: [] };
  }
}

async function loadEpisodes(agentId, opts) {
  try {
    const episodicMemory = require('./episodicMemoryService');
    const episodes = await episodicMemory.getRecentEpisodes({
      agentId,
      taskId: opts.taskId,
      sessionId: opts.sessionId,
      limit: opts.episodicLimit || 5
    });
    return Array.isArray(episodes) ? episodes : [];
  } catch (error) {
    readFailed(agentId, error, 'episodic-load');
    return [];
  }
}

async function searchFailureMemories(task, opts) {
  try {
    const primitives = require('./primitiveHandlers/memory');
    const res = await primitives.searchFailures({ query: task, limit: 3, organizationId: opts.organizationId });
    if (!res || !Array.isArray(res.failures)) return [];
    return res.failures.filter(similarEnough).map(toPitfall);
  } catch (error) {
    readFailed(null, error, 'failure-search');
    return [];
  }
}

async function loadPitfalls(task, opts, base) {
  const found = Array.isArray(base) ? base : [];
  if (found.length > 0) return found;
  return searchFailureMemories(task, opts);
}

async function retrieveAgentMemories(agentId, task, options) {
  const opts = options || {};
  const search = await searchExperiences(agentId, task, opts);
  const episodes = await loadEpisodes(agentId, opts);
  const pitfalls = await loadPitfalls(task, opts, search.pitfalls);
  return {
    experiences: filterUnverified(search.experiences).slice(0, 4),
    pitfalls: filterUnverified(pitfalls).slice(0, 3),
    goldenPaths: filterUnverified(search.goldenPaths).slice(0, 2),
    episodes: filterUnverified(episodes).filter(highReward).slice(0, 4)
  };
}

function isRegularVesicle(item) {
  if (!item || !item.content) return false;
  return item.content.indexOf('[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD]') === -1;
}

function vesicleLine(item) {
  return `  * ⚡ ${truncateWords(item.content, 250)}`;
}

function regularVesicleLines(engrams) {
  const list = Array.isArray(engrams) ? engrams : [];
  return list.filter(isRegularVesicle).map(vesicleLine);
}

function findEpistemicShield(engrams) {
  const list = Array.isArray(engrams) ? engrams : [];
  for (const item of list) {
    if (item && item.content && item.content.indexOf('[SYSTEM_DIRECTIVE_EPISTEMIC_SHIELD]') !== -1) return item.content;
  }
  return null;
}

function consumeAfterInjection(agentId, peekRequested) {
  return async () => {
    if (peekRequested) return;
    await vesicles.consumeVesicles(agentId);
  };
}

async function collectVesicleSections(agentId, opts) {
  const peekRequested = opts.peekVesicles === true;
  const engrams = await vesicles.peekVesicles(agentId);
  return {
    shield: findEpistemicShield(engrams),
    regular: regularVesicleLines(engrams),
    consume: consumeAfterInjection(agentId, peekRequested)
  };
}

function experienceWeight(entry) {
  const direct = entry.synaptic_weight;
  if (direct !== undefined && direct !== null) return ` (force: ${Number(direct).toFixed(1)})`;
  if (entry.weight !== undefined && entry.weight !== null) return ` (force: ${Number(entry.weight).toFixed(1)})`;
  return '';
}

function experienceLine(entry) {
  const title = entry.title ? `[${entry.title}] ` : '';
  return `  * ${title}${truncateWords(entry.summary || entry.content || '', 250)}${experienceWeight(entry)}`;
}

function pitfallLine(entry) {
  return `  * ⚠️ ${truncateWords(entry.summary || entry.content || entry.title || '', 200)}`;
}

function goldenLine(entry) {
  return `  * 🎯 ${formatGoldenPath(entry)}`;
}

function episodeLine(episode) {
  return `  * [${episode.actionType}] ${truncateWords(episode.observationOutput || episode.actionInput, 220)} (récompense: ${Number(episode.rewardScore).toFixed(2)})`;
}

function pushExperienceSections(sections, memories) {
  const expLines = memories.experiences.map(experienceLine);
  if (expLines.length > 0) sections.push(`- Souvenirs & Leçons Apprises :\n${expLines.join('\n')}`);
  const pitLines = memories.pitfalls.map(pitfallLine);
  if (pitLines.length > 0) sections.push(`- Pièges & Échecs à Éviter Absolument (Anti-Trauma) :\n${pitLines.join('\n')}`);
  const gpLines = memories.goldenPaths.map(goldenLine);
  if (gpLines.length > 0) sections.push(`- Golden Paths Connus :\n${gpLines.join('\n')}`);
  const epLines = memories.episodes.map(episodeLine);
  if (epLines.length > 0) sections.push(`- Épisodes récents consolidés :\n${epLines.join('\n')}`);
}

function buildMemorySections(memories, regular) {
  const sections = [];
  if (regular.length > 0) sections.push(`- Vésicules Synaptiques Reçues (Synaptic Cleft) :\n${regular.join('\n')}`);
  pushExperienceSections(sections, memories);
  return sections;
}

function assemblePromptBlock(sections, shield) {
  if (sections.length === 0 && !shield) return '';
  let block = '';
  if (shield) block += `${shield}\n\n`;
  if (sections.length > 0) {
    block += `[MÉMOIRE COGNITIVE & EXPÉRIENCES PERTINENTES (GraphRAG)]\n` +
      `Tu disposes des souvenirs suivants issus d'expériences antérieures sur des problèmes analogues. Utilise-les pour guider tes choix :\n` +
      sections.join('\n\n') + '\n\n';
  }
  return block;
}

async function formatCognitiveMemoryPrompt(agentId, task, options) {
  const opts = options || {};
  try {
    const memories = await retrieveAgentMemories(agentId, task, opts);
    const injections = await collectVesicleSections(agentId, opts);
    const sections = buildMemorySections(memories, injections.regular);
    const promptBlock = assemblePromptBlock(sections, injections.shield);
    await injections.consume();
    return promptBlock;
  } catch (error) {
    readFailed(agentId, error, 'memory-prompt');
    return '';
  }
}

function goldenSteps(record) {
  if (Array.isArray(record.turns)) return record.turns;
  if (Array.isArray(record.goldenPathSteps)) return record.goldenPathSteps;
  return goldenStepsFromRaw(record.content || record.summary || '');
}

function pickGoldenSteps(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.goldenPathSteps)) return parsed.goldenPathSteps;
  if (parsed && Array.isArray(parsed.turns)) return parsed.turns;
  return [];
}

function goldenStepsFromRaw(rawData) {
  if (typeof rawData !== 'string') return [];
  const trimmed = rawData.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return [];
  try {
    return pickGoldenSteps(JSON.parse(rawData));
  } catch (_) {
    return [];
  }
}

function formatGoldenStep(step, idx) {
  const num = step.step || idx + 1;
  const action = step.action || step.type || step.classification || 'step';
  const detail = step.detail || step.thought || step.cmd || step.action || '';
  return `${num}. [${action}] ${detail}`.trim();
}

function formatGoldenSteps(title, steps) {
  const line = steps.map(formatGoldenStep).slice(0, 6).join(' -> ');
  return `${title} ${line}`.trim();
}

function formatGoldenPath(g) {
  if (!g) return '';
  const title = g.title ? `[${g.title}]` : '';
  const steps = goldenSteps(g);
  if (steps.length > 0) return formatGoldenSteps(title, steps);
  const summary = g.summary || '';
  const fallbackText = (summary && summary.indexOf('[') !== 0 ? summary : g.title || summary || '').slice(0, 300);
  return `${title} ${fallbackText}`.trim();
}

module.exports = {
  retrieveAgentMemories,
  formatCognitiveMemoryPrompt,
  formatGoldenPath,
  truncateWords
};
