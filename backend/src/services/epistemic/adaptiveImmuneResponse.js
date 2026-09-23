'use strict';

const { decisionFromAdaptive, summarize, describe } = require('./adaptiveEpistemicDecision');
const { toAntigen } = require('./antigenModel');
const { defaultCatalog, selectTopClones } = require('./verifierCatalogService');

function assembleAntigen(input) {
  if (!input || typeof input !== 'object') return toAntigen({});
  if (input.formalResult) return toAntigen({ formalResult: input.formalResult });
  if (input.claim != null || input.risk != null || input.epitopes != null) {
    const e = input.epitopes || {};
    return toAntigen({
      claim: input.claim,
      risk: input.risk,
      evidence: e.evidence,
      provenance: e.provenance,
      validityDomain: e.validityDomain,
      dependencies: e.dependencies,
      assumptions: e.assumptions,
      producer: input.producer,
    });
  }
  return toAntigen({});
}

function buildAssignments(topClones) {
  return topClones.map((v) => ({
    verifier: v.type,
    strategy: v.strategy.slice(),
    affinity: v.affinity,
  }));
}

function adaptiveImmuneResponse(claim, antigen, context = {}) {
  const decision = decisionFromAdaptive(claim, antigen, context);
  const catalog = context.catalog || defaultCatalog();
  const topClones = selectTopClones(catalog, antigen, { strategyBias: context.strategyBias || null, count: context.cloneCount || 2 });
  return {
    ...decision,
    assignedVerifiers: buildAssignments(topClones),
    verifierCatalogSnapshot: topClones.map((v) => v.type),
  };
}

function runAdaptivePipeline(input, context = {}) {
  const antigen = assembleAntigen(input);
  const claim = antigen.claim;
  const decision = adaptiveImmuneResponse(claim, antigen, context);
  return { antigen, decision, summary: summarize(decision), detail: describe(decision), full: decision };
}

function contextTypeError(ctx) {
  if (ctx.catalog != null && typeof ctx.catalog !== 'object') return 'catalog must be an object.';
  if (ctx.strategyBias != null && typeof ctx.strategyBias !== 'function') return 'strategyBias must be a function.';
  if (ctx.cloneCount != null && (!Number.isInteger(ctx.cloneCount) || ctx.cloneCount < 1)) return 'cloneCount must be an integer >= 1.';
  if (ctx.externalSourceNotVerified != null && typeof ctx.externalSourceNotVerified !== 'boolean') return 'externalSourceNotVerified must be a boolean.';
  return null;
}

function contextError(ctx) {
  if (!ctx) return null;
  return contextTypeError(ctx);
}

function inputTypeError(input) {
  if (input.claim != null && typeof input.claim !== 'string') return 'claim must be a string.';
  if (input.claim === '' && !input.formalResult) return 'Empty claim with no formalResult.';
  if (input.epitopes != null && typeof input.epitopes !== 'object') return 'epitopes must be an object if provided.';
  if (input.risk != null && (typeof input.risk !== 'object' || typeof input.risk.score !== 'number')) return 'risk.score must be a number if provided.';
  return null;
}

function validatePipelineInput(input) {
  if (!input || typeof input !== 'object') return { valid: false, error: 'Epitope pipeline requires an object payload.' };
  if (input.claim == null && !input.formalResult) return { valid: false, error: 'Missing claim or formalResult.' };
  const typeError = inputTypeError(input);
  if (typeError) return { valid: false, error: typeError };
  const ctxError = contextError(input.context);
  if (ctxError) return { valid: false, error: ctxError };
  return { valid: true };
}

module.exports = {
  assembleAntigen,
  adaptiveImmuneResponse,
  runAdaptivePipeline,
  validatePipelineInput,
  defaultCatalog: require('./verifierCatalogService').defaultCatalog,
  toAntigen,
};
