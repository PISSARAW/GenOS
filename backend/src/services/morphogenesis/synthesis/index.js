'use strict';

const { MUTATION_TYPES, createMorphogenContext, computeMutationProbabilities, applyMutations, generateCandidates, generateMutationParams, MORPHOGEN_SIGNALS } = require('./developmentalGenerator');
const { MorphogenService } = require('./morphogenService');
const { StructuralPressureService } = require('./structuralPressureService');
const { CandidateEvaluator, CandidatePruner } = require('./candidateEvaluator');
const { CounterfactualSearch, MorphologySynthesizer } = require('./morphologySynthesizer');
const { MORPHOLOGY_LEVELS, selectMinimumMorphology } = require('./minimalMorphologyPolicy');
const { generateMorphologyCandidates } = require('./morphologyCandidateGenerator');
const { MUTATION_TYPES: LOCAL_MUTATION_TYPES, generateLocalMutations } = require('./morphologyMutationGenerator');
const { COMPOSITIONS, TERMINALS, LIMIT_DEFAULTS, analyzeMorphology } = require('./morphologyGrammar');
const { morphologyPatterns } = require('./morphologyPatterns');
const { morphologyPatternLibrary } = require('./morphologyPatternLibrary');

module.exports = {
  developmentalGenerator: {
    MUTATION_TYPES,
    MORPHOGEN_SIGNALS,
    createMorphogenContext,
    computeMutationProbabilities,
    applyMutations,
    generateCandidates,
    generateMutationParams
  },
  MorphogenService,
  StructuralPressureService,
  CandidateEvaluator,
  CandidatePruner,
  CounterfactualSearch,
  MorphologySynthesizer,
  MORPHOLOGY_LEVELS,
  selectMinimumMorphology,
  generateMorphologyCandidates,
  morphologyMutationGenerator: {
    MUTATION_TYPES: LOCAL_MUTATION_TYPES,
    generateLocalMutations
  },
  morphologyGrammar: {
    COMPOSITIONS,
    TERMINALS,
    LIMIT_DEFAULTS,
    analyzeMorphology
  },
  morphologyPatterns,
  morphologyPatternLibrary
};