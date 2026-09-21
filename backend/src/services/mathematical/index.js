'use strict';

const { MathematicalCulture } = require('./mathematicalCultureService');

const env = require('./mathematicalEnvironment');
const lineage = require('./researchLineage');
const niche = require('./mathematicalNiche');
const artifact = require('./proofArtifact');
const epitopes = require('./goalEpitopeExtractor');
const repertoire = require('./proofStrategyRepertoire');
const population = require('./mathematicalPopulation');
const nicheService = require('./mathematicalNichePopulationService');
const foraging = require('./mathematicalLiteratureForaging');
const mutation = require('./mutationEngine');

module.exports = {
  createMathematicalEnvironment: env.createMathematicalEnvironment,
  createResearchLineage: lineage.createResearchLineage,
  createMathematicalNiche: niche.createMathematicalNiche,
  createProofArtifact: artifact.createProofArtifact,
  extractEpitopes: epitopes.extractEpitopes,
  ProofStrategyRepertoire: repertoire.ProofStrategyRepertoire,
  MathematicalPopulation: population.MathematicalPopulation,
  MathematicalNichePopulationService: nicheService.MathematicalNichePopulationService,
  LiteratureForager: foraging.LiteratureForager,
  PatchResult: foraging.PatchResult,
  MutationEngine: mutation.MutationEngine,
  MathematicalCulture,
};
