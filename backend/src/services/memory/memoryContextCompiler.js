/**
 * Memory Context Compiler
 * Compiles compact memory contexts with token budget enforcement.
 */

const MAX_TOKEN_BUDGET = 2000;
const DEFAULT_BUDGET = 2000;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / CHARS_PER_TOKEN);
}

function itemTokens(item) {
  const parts = [
    item.title || '',
    item.summary || item.content || '',
    (item.tags || []).join(' '),
    item.actionInput || '',
    item.observationOutput || ''
  ];
  return estimateTokens(parts.join(' '));
}

function relevanceScore(item, query) {
  if (!item) return 0;
  const q = String(query || '').toLowerCase();
  let score = item.similarityScore || 0;
  if (item.tags && q) {
    for (const tag of item.tags) {
      if (q.includes(String(tag).toLowerCase())) score += 0.1;
    }
  }
  if (item.status === 'SUCCESS') score += 0.05;
  return Math.min(1, score);
}

function compileContext(ctx) {
  const { relevantFacts = [], relevantEpisodes = [], procedures = [], knownDeadEnds = [], budget = DEFAULT_BUDGET, query = '' } = ctx || {};
  const tokenBudget = Math.min(MAX_TOKEN_BUDGET, Math.max(1, Number(budget) || DEFAULT_BUDGET));

  const allItems = [
    ...relevantFacts.map(i => ({ ...i, _kind: 'fact' })),
    ...relevantEpisodes.map(i => ({ ...i, _kind: 'episode' })),
    ...procedures.map(i => ({ ...i, _kind: 'procedure' })),
    ...knownDeadEnds.map(i => ({ ...i, _kind: 'dead_end' }))
  ];

  const scored = allItems.map(item => ({
    item,
    tokens: itemTokens(item),
    relevance: relevanceScore(item, query)
  }));

  scored.sort((a, b) => b.relevance - a.relevance);

  const selected = [];
  const provenance = [];
  let usedTokens = 0;

  for (const entry of scored) {
    if (usedTokens + entry.tokens > tokenBudget) continue;
    selected.push(entry.item);
    usedTokens += entry.tokens;
    if (entry.item.id || entry.item.provenance) {
      provenance.push({
        id: entry.item.id || null,
        kind: entry.item._kind,
        ref: entry.item.provenance || entry.item.id || null
      });
    }
  }

  return {
    query,
    tokenBudget,
    usedTokens,
    remainingTokens: tokenBudget - usedTokens,
    itemCount: selected.length,
    items: selected,
    provenance
  };
}

module.exports = {
  MAX_TOKEN_BUDGET,
  estimateTokens,
  compileContext
};
