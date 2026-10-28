'use strict';

const { MAX_TOKEN_BUDGET, compileContext } = require('./memory/memoryContextCompiler');
const scope = require('./agentMemoryScope');

function contextBudget(options, maximum) {
  const requested = Number(options?.memoryContextTokenBudget);
  if (!Number.isFinite(requested) || requested < 0) return maximum;
  return Math.min(maximum, Math.floor(requested));
}

function selectRegularVesicles(lines, limit, measure) {
  const selected = [];
  for (const line of lines || []) {
    selected.push(line);
    if (measure(selected) > limit) selected.pop();
  }
  return selected;
}

function createSelection(rendering) {
  const { buildMemorySections, assemblePromptBlock, estimateMemoryTokens } = rendering;

  function emptySelection() {
    return { experiences: [], pitfalls: [], goldenPaths: [], episodes: [] };
  }

  function historicalBudget(options) {
    const requested = Number(options?.historicalMemoryTokenBudget);
    if (!Number.isFinite(requested) || requested < 0) return 2000;
    return Math.min(2000, Math.floor(requested));
  }

  function historyTokens(memories) {
    return estimateMemoryTokens(buildMemorySections(memories, []).join('\n\n'));
  }

  function renderedTokens(memories, regular, shield) {
    return estimateMemoryTokens(assemblePromptBlock(buildMemorySections(memories, regular), shield));
  }

  function rankHistorical(memories, query) {
    const kinds = ['experiences', 'pitfalls', 'goldenPaths', 'episodes'];
    const keyed = Object.fromEntries(kinds.map((kind) => [kind,
      (memories[kind] || []).map((item, index) => ({
        ...item,
        _promptMemoryKey: `${kind}:${index}`,
        similarityScore: Number(item.similarityScore ?? item.similarity) || 0
      }))]));
    const compiled = compileContext({
      relevantFacts: keyed.pitfalls,
      relevantEpisodes: keyed.episodes,
      procedures: [...keyed.experiences, ...keyed.goldenPaths],
      budget: MAX_TOKEN_BUDGET,
      query
    });
    const rankedKeys = compiled.items.map((item) => item._promptMemoryKey);
    return Object.fromEntries(kinds.map((kind) => {
      const source = keyed[kind];
      const ranked = rankedKeys.map((key) => source.find((item) => item._promptMemoryKey === key)).filter(Boolean);
      const selected = new Set(ranked.map((item) => item._promptMemoryKey));
      return [kind, [...ranked, ...source.filter((item) => !selected.has(item._promptMemoryKey))]];
    }));
  }

  function selectHistorical(memories, options, query) {
    const selected = emptySelection();
    const historicalLimit = historicalBudget(options);
    const regular = options?._memoryContextRegularLines || [];
    const shield = options?._memoryContextShield || null;
    const totalLimit = contextBudget(options, MAX_TOKEN_BUDGET);
    const ranked = rankHistorical(memories, query);
    const cautions = ranked.experiences.filter(scope.isCaution);
    const ordinary = ranked.experiences.filter((item) => !scope.isCaution(item));
    const queues = [['pitfalls', ranked.pitfalls], ['experiences', cautions],
      ['goldenPaths', ranked.goldenPaths], ['experiences', ordinary], ['episodes', ranked.episodes]];
    for (const [kind, entries] of queues) {
      for (const entry of entries || []) {
        selected[kind].push(entry);
        if (historyTokens(selected) > historicalLimit
          || renderedTokens(selected, regular, shield) > totalLimit) selected[kind].pop();
      }
    }
    return selected;
  }

  function selectRegular(lines, options) {
    const totalLimit = contextBudget(options, MAX_TOKEN_BUDGET);
    return selectRegularVesicles(lines, totalLimit, (selected) =>
      renderedTokens(emptySelection(), selected, options._memoryContextShield));
  }

  return { emptySelection, selectHistorical, selectRegular };
}

module.exports = { contextBudget, createSelection, selectRegularVesicles };
