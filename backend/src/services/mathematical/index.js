'use strict';

/**
 * @file index.js
 * @description Mathematical services index — Math-1 through Math-4.
 */

const { createMathematicalEnvironment } = require('./mathematicalEnvironment');
const { createResearchLineage } = require('./researchLineage');
const { createMathematicalNiche } = require('./mathematicalNiche');
const { createProofArtifact } = require('./proofArtifact');
const { extractEpitopes } = require('./goalEpitopeExtractor');
const { ProofStrategyRepertoire } = require('./proofStrategyRepertoire');
const { MathematicalPopulation } = require('./mathematicalPopulation');
const { MathematicalNichePopulationService } = require('./mathematicalNichePopulationService');
const { LiteratureForager, PatchResult } = require('./mathematicalLiteratureForaging');
const { MutationEngine } = require('./mutationEngine');

module.exports = {
  createMathematicalEnvironment,
  createResearchLineage,
  createMathematicalNiche,
  createProofArtifact,
  extractEpitopes,
  ProofStrategyRepertoire,
  MathematicalPopulation,
  MathematicalNichePopulationService,
  LiteratureForager,
  PatchResult,
  MutationEngine,
};
