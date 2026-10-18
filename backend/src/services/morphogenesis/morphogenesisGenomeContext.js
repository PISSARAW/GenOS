'use strict';

const SCHEMA = 'genos.morphogenesis-genome-context/v1';
const store = require('../agentDnaStore');

function firstPresent(values) {
  return values.find((value) => value !== undefined && value !== null) ?? null;
}

function scopeOf(ctx) {
  const mission = firstPresent([ctx.normalizedMission, ctx.mission, {}]);
  const parent = firstPresent([ctx.dispatchedAgent, ctx.parent, {}]);
  return {
    organizationId: firstPresent([ctx.organizationId, mission.organizationId,
      parent.organization_id, mission.workspace?.organizationId]),
    projectId: firstPresent([ctx.projectId, mission.projectId,
      parent.project_id, mission.workspace?.projectId])
  };
}

function publicDescriptor(genome) {
  return {
    id: genome.id,
    name: genome.name,
    contentHash: genome.contentHash,
    phenotypeHash: genome.phenotypeHash,
    genomeId: genome.genomeId,
    lineageId: genome.lineageId,
    generation: genome.generation,
    dnaStatus: genome.dnaStatus,
    phenotype: genome.phenotype,
    capabilities: genome.capabilities,
    tools: genome.tools,
    plasmids: genome.plasmids,
    scars: genome.scars,
    provenance: genome.provenance,
    signed: genome.signed,
    signer: genome.signer,
    signatureValid: genome.signatureValid,
    trustReason: genome.trustReason
  };
}

function unavailable(scope, error) {
  return {
    schema: SCHEMA,
    status: 'unavailable',
    scope,
    eligible: [],
    excluded: [],
    errors: [error.code || error.message || 'genome_context_unavailable']
  };
}

async function loadMissionGenomeContext(ctx) {
  const scope = scopeOf(ctx);
  if (!ctx.db) return unavailable(scope, { code: 'database_unavailable' });
  try {
    const portfolio = await store.listGenomePortfolio(ctx.db, scope);
    return {
      schema: SCHEMA,
      status: portfolio.status,
      scope,
      eligible: portfolio.eligible.map(publicDescriptor),
      excluded: portfolio.excluded,
      errors: []
    };
  } catch (error) {
    return unavailable(scope, error);
  }
}

function summary(context) {
  if (!context) return null;
  return {
    schema: context.schema,
    status: context.status,
    scope: context.scope,
    eligibleCount: context.eligible.length,
    excluded: context.excluded,
    errors: context.errors
  };
}

function enrichPlanningInput(input, context) {
  if (!context) return input;
  return {
    ...input,
    availableGenomes: context.eligible.map(publicDescriptor),
    genomeContext: summary(context)
  };
}

function bindGenomeContext(plan, context) {
  if (!plan || !context) return plan;
  plan.genomeContext = summary(context);
  return plan;
}

module.exports = {
  SCHEMA,
  bindGenomeContext,
  enrichPlanningInput,
  loadMissionGenomeContext,
  scopeOf
};
