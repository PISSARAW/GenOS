'use strict';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function validatePattern(input) {
  if (!input || !input.id || !input.pattern || typeof input.pattern !== 'object') {
    throw new Error('pattern id and morphology expression are required');
  }
  if (!Number.isFinite(input.priorWeight) || input.priorWeight < 0 || input.priorWeight > 1) {
    throw new Error('pattern priorWeight must be between zero and one');
  }
}

function createMorphologyPatternLibrary(initialPatterns = []) {
  const patterns = new Map();

  function describe(pattern) {
    return { ...pattern, tags: [...pattern.tags], pattern: clone(pattern.pattern) };
  }

  function register(input) {
    validatePattern(input);
    if (patterns.has(input.id)) throw new Error(`pattern already registered: ${input.id}`);
    const stored = Object.freeze({
      id: input.id,
      description: input.description || '',
      tags: Array.isArray(input.tags) ? [...input.tags] : [],
      priorWeight: input.priorWeight,
      evidenceStatus: input.evidenceStatus || 'conceptual',
      pattern: clone(input.pattern)
    });
    patterns.set(stored.id, stored);
    return describe(stored);
  }

  initialPatterns.forEach(register);
  return {
    register,
    get(id) {
      const pattern = patterns.get(id);
      return pattern ? describe(pattern) : null;
    },
    list() {
      return [...patterns.values()].map(describe);
    },
    findByTags(tags = []) {
      const required = new Set(tags);
      return [...patterns.values()]
        .filter((pattern) => [...required].every((tag) => pattern.tags.includes(tag)))
        .sort((left, right) => right.priorWeight - left.priorWeight)
        .map(describe);
    }
  };
}

module.exports = { createMorphologyPatternLibrary };
