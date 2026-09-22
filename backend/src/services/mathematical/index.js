'use strict';

const { MathematicalCulture } = require('./mathematicalCultureService');
const { MathematicalOrganismRuntime, createMathematicalOrganismRuntime } = require('./mathematicalOrganismRuntime');

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

const { QuestionogenesisEngine } = require('./questionogenesisService');
const { ConceptogenesisEngine, createConceptogenesisEngine, CONCEPT_TYPES } = require('./conceptogenesisEngine');
const { SymbiontExecutor, createSymbiontExecutor, SOLVER_TYPES } = require('./symbiontSolver');

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
  QuestionogenesisEngine,
  ConceptogenesisEngine,
  createConceptogenesisEngine,
  MathematicalOrganismRuntime,
  createMathematicalOrganismRuntime,
  SymbiontExecutor,
  createSymbiontExecutor,
  SOLVER_TYPES,
  CONCEPT_TYPES,
};
