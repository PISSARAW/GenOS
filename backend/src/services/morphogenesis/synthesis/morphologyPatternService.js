'use strict';

const { createMorphologyPatternLibrary } = require('./morphologyPatternLibrary');
const { MORPHOLOGY_PATTERNS } = require('./morphologyPatterns');

function createMorphologyPatternService(patterns = MORPHOLOGY_PATTERNS) {
  const library = createMorphologyPatternLibrary(patterns);
  return {
    register: library.register,
    get: library.get,
    list: library.list,
    suggest(tags) {
      return library.findByTags(tags).map((pattern) => ({ ...pattern, role: 'prior' }));
    }
  };
}

module.exports = { createMorphologyPatternService };
