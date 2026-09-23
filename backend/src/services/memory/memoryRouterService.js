/**
 * Memory Router Service
 * Routes queries to the correct memory store based on intent classification.
 */

const MEMORY_TYPES = Object.freeze({
  EPISODIC: 'episodic',
  SEMANTIC: 'semantic',
  PROCEDURAL: 'procedural',
  NEGATIVE: 'negative',
  FOSSIL: 'fossil',
  TRANSACTIVE: 'transactive'
});

const MEMORY_TYPE_DESCRIPTIONS = Object.freeze({
  [MEMORY_TYPES.EPISODIC]: 'Personal experiences and episodic memories',
  [MEMORY_TYPES.SEMANTIC]: 'Semantic knowledge, facts, and repository understanding',
  [MEMORY_TYPES.PROCEDURAL]: 'Procedural memory: how to perform tasks',
  [MEMORY_TYPES.NEGATIVE]: 'Negative knowledge: known dead ends and failures',
  [MEMORY_TYPES.FOSSIL]: 'Fossil record: memories from ancestor agents',
  [MEMORY_TYPES.TRANSACTIVE]: 'Transactive memory: what peers and colleagues know'
});

const ROUTING_PATTERNS = [
  { type: MEMORY_TYPES.EPISODIC, patterns: ['have i', 'did i', 'seen this', 'experienced', 'remember when', 'happened to me', 'my memory'] },
  { type: MEMORY_TYPES.SEMANTIC, patterns: ['how does', 'what is', 'repository', 'codebase', 'architecture', 'system work', 'understand'] },
  { type: MEMORY_TYPES.PROCEDURAL, patterns: ['how do i', 'how to', 'perform', 'procedure', 'steps to', 'execute', 'run'] },
  { type: MEMORY_TYPES.NEGATIVE, patterns: ['what failed', 'what not to do', 'avoid', 'mistake', 'dead end', 'pitfall', 'error', 'wrong'] },
  { type: MEMORY_TYPES.FOSSIL, patterns: ['ancestor', 'predecessor', 'previous agent', 'earlier version', 'what happened to', 'old agent'] },
  { type: MEMORY_TYPES.TRANSACTIVE, patterns: ['peer', 'other agent', 'colleague', 'what do others', 'shared knowledge', 'team know'] }
];

function normalizeQuery(query) {
  return String(query || '').toLowerCase().trim();
}

function scoreTypeAgainstQuery(query, patterns) {
  let score = 0;
  for (const pattern of patterns) {
    if (query.includes(pattern)) score += pattern.length;
  }
  return score;
}

function inferTypeFromQuery(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return MEMORY_TYPES.SEMANTIC;
  let bestType = MEMORY_TYPES.SEMANTIC;
  let bestScore = 0;
  for (const route of ROUTING_PATTERNS) {
    const score = scoreTypeAgainstQuery(normalized, route.patterns);
    if (score > bestScore) {
      bestScore = score;
      bestType = route.type;
    }
  }
  return bestType;
}

function resolveStore(type) {
  const storeMap = {
    [MEMORY_TYPES.EPISODIC]: 'episodic_memories',
    [MEMORY_TYPES.SEMANTIC]: 'genome_decisions',
    [MEMORY_TYPES.PROCEDURAL]: 'genome_decisions',
    [MEMORY_TYPES.NEGATIVE]: 'genome_decisions',
    [MEMORY_TYPES.FOSSIL]: 'genome_decisions',
    [MEMORY_TYPES.TRANSACTIVE]: 'genome_decisions'
  };
  return storeMap[type] || 'genome_decisions';
}

function routeQuery(ctx) {
  const { query, type, agentId } = ctx || {};
  const normalizedQuery = normalizeQuery(query);
  const resolvedType = type || inferTypeFromQuery(normalizedQuery);
  const store = resolveStore(resolvedType);
  return {
    query: normalizedQuery,
    agentId: agentId || null,
    type: resolvedType,
    store,
    description: MEMORY_TYPE_DESCRIPTIONS[resolvedType] || 'Unknown memory type'
  };
}

function getMemoryTypes() {
  return Object.values(MEMORY_TYPES);
}

module.exports = {
  MEMORY_TYPES,
  MEMORY_TYPE_DESCRIPTIONS,
  routeQuery,
  getMemoryTypes
};
