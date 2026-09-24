'use strict';

const agentEvolution = require('../../agentEvolutionService');
const { composePortfolio } = require('../../../cognition/cognitivePortfolio');
const cryptobiosis = require('../../cryptobiosisSporeService');
const { createIndividual } = require('../contracts/individual');
const populations = require('./populationService');

async function mutatePopulation(population, requests, options = {}) {
  requireDatabase(options);
  const parents = new Map(population.individuals.map((item) => [item.individualId, item]));
  const variants = await evolveRequests({ requests, parents, options });
  const result = populations.spawn(population, variants);
  return { ...result, variants };
}

function requireDatabase(options) {
  if (!options.db) throw Object.assign(new Error('Genome evolution requires a database for its lineage receipt.'), { code: 'BIOME_EVOLUTION_DATABASE_REQUIRED' });
}

async function evolveRequests({ requests, parents, options }) {
  const variants = [];
  const issuedIds = new Set();
  for (const request of Array.isArray(requests) ? requests : []) {
    const parent = parents.get(request.parentId);
    if (!parent) throw Object.assign(new Error(`Unknown variant parent '${request.parentId}'.`), { code: 'BIOME_INDIVIDUAL_UNKNOWN' });
    if (!request.individualId || parents.has(request.individualId) || issuedIds.has(request.individualId)) {
      throw Object.assign(new Error(`Variant identifier '${request.individualId}' is missing or already in use.`), { code: 'BIOME_INDIVIDUAL_DUPLICATE' });
    }
    issuedIds.add(request.individualId);
    variants.push(await evolveOne({ request, parent, options }));
  }
  return variants;
}

async function evolveOne({ request, parent, options }) {
  const evolved = await agentEvolution.evolveWorkerGenome(parentInput(parent), { role: request.role || parent.role }, {
    db: options.db, strategy: request.strategy, mutationRate: request.mutationRate, scope: options.scope
  });
  const portfolio = request.needs ? composePortfolio({ needs: request.needs, recipeCount: 1 }) : null;
  return createIndividual({
    individualId: request.individualId,
    role: request.role || parent.role,
    capabilities: request.capabilities || parent.capabilities,
    genome: { genomeRef: evolved.genomeRef, genes: evolved.genes, parents: evolved.parents },
    phenotype: { ...parent.phenotype, strategy: evolved.genes.strategy },
    cognitiveRecipe: request.cognitiveRecipe || portfolio?.recipes[0] || parent.cognitiveRecipe,
    fitnessReceipts: []
  });
}

function parentInput(parent) {
  const genome = parent.genome || {};
  return { id: parent.individualId, name: parent.role, role: parent.role, genes: genome.genes || genome };
}

function freezeIndividual(population, individualId, options = {}) {
  const individual = population.individuals.find((item) => item.individualId === individualId);
  if (!individual) throw Object.assign(new Error(`Unknown individual '${individualId}'.`), { code: 'BIOME_INDIVIDUAL_UNKNOWN' });
  const spore = cryptobiosis.vitrifyState(individual, options);
  const frozenSpore = { individualId, payloadHash: spore.payloadHash, rawBlob: spore.rawBlob.toString('base64'),
    trehaloseConcentration: spore.trehaloseConcentration, bunkerArmor: spore.bunkerArmor,
    vitrifiedAt: spore.vitrifiedAt, hydrationLevel: spore.hydrationLevel, isVitrified: spore.isVitrified };
  return {
    population: populations.normalizePopulation({ ...population,
      individuals: population.individuals.filter((item) => item.individualId !== individualId),
      spores: [...(population.spores || []), frozenSpore],
      status: population.individuals.length === 1 ? 'dormant' : population.status
    }),
    spore: frozenSpore
  };
}

function thawIndividual(population, individualId, environment = {}) {
  const spore = (population.spores || []).find((item) => item.individualId === individualId);
  if (!spore) throw Object.assign(new Error(`No frozen individual '${individualId}'.`), { code: 'BIOME_SPORE_UNKNOWN' });
  const restored = cryptobiosis.germinateSpore({ ...spore, rawBlob: Buffer.from(spore.rawBlob, 'base64') }, environment);
  const result = populations.spawn(populations.normalizePopulation({ ...population,
    spores: population.spores.filter((item) => item.individualId !== individualId)
  }), [restored.state]);
  return { population: populations.advance(result.population, { productivity: population.productivity }), individual: restored.state };
}

module.exports = { mutatePopulation, freezeIndividual, thawIndividual };
