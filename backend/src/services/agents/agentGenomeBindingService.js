'use strict';

const store = require('../agentDnaStore');
const { resolveGenotype } = require('../morphogenesis/genotypeResolverService');

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function scopeOf(parent, request) {
  return {
    organizationId: parent?.organization_id || request?.workspace?.organizationId,
    projectId: parent?.project_id || request?.workspace?.projectId
  };
}

function requirementsOf(request) {
  return {
    domain: request.role,
    traits: safeArray(request.capabilityManifest?.owned),
    constraints: safeArray(request.phenotype?.constraints),
    mission: request.mission?.prompt || ''
  };
}

function assignmentOf(request, genomeRef) {
  return {
    role: request.role,
    capabilities: safeArray(request.capabilityManifest?.owned),
    mission: request.mission?.prompt || '',
    genomeRef: genomeRef || request.phenotype?.genomeRef,
    preferredName: request.phenotype?.preferredName,
    tools: safeArray(request.phenotype?.tools)
  };
}

function explicitGenomeRequested(request) {
  return Boolean(request.phenotype?.genomeRef || request.phenotype?.preferredName);
}

function rejectedBinding(request, cause) {
  const reference = request.phenotype?.genomeRef || request.phenotype?.preferredName;
  return Object.assign(new Error(`Explicit genome '${reference}' is not admissible.`), {
    code: 'GENOME_BINDING_REJECTED',
    cause
  });
}

async function selectAssignment(ctx) {
  const { db, parent, request, assignment } = ctx;
  try {
    const selected = await store.workerGenesForAssignment(db,
      { ...assignment, agentId: parent?.id }, scopeOf(parent, request));
    if (!selected && explicitGenomeRequested(request)) throw rejectedBinding(request);
    return selected;
  } catch (error) {
    if (explicitGenomeRequested(request)) throw rejectedBinding(request, error);
    return null;
  }
}

async function selectForIncarnation(ctx) {
  const { db, parent, request } = ctx;
  const scope = scopeOf(parent, request);
  let decision = null;
  try {
    const portfolio = await store.listGenomePortfolio(db, scope);
    decision = await resolveGenotype({
      requirements: requirementsOf(request),
      availableGenomes: portfolio.eligible,
      db,
      scope
    });
  } catch (error) {
    if (explicitGenomeRequested(request)) throw rejectedBinding(request, error);
  }
  const genomeRef = !explicitGenomeRequested(request) && decision?.action === 'reuse'
    ? decision.genomeRef : null;
  const selected = await selectAssignment({ db, parent, request,
    assignment: assignmentOf(request, genomeRef) });
  if (selected && decision) selected.morphogenesisDecision = decision;
  return selected;
}

module.exports = { assignmentOf, requirementsOf, scopeOf, selectForIncarnation };
