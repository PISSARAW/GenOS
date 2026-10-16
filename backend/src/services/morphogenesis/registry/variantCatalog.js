'use strict';

const aTeam = require('../../aTeam/variants/variantRegistry');
const biocenose = require('../../biocenose/variants/variantPolicyRouter');
const holobionte = require('../../holobionte/variants');
const syncytium = require('../../syncytium/variants/variantPolicyRegistry');
const rhizome = require('../../rhizome/variants/variantPolicyService');
const metapopulation = require('../../metapopulation/policy/metapopulationPolicyService');
const metapopulationMaturity = require('../../metapopulation/policy/metapopulationVariantMaturity');
const biome = require('../../biome/variants/variantPolicyService');
const biomeRuntime = require('../../biome/variants/variantRuntimeService');
const trinity = require('../../trinityVariantService');
const aTeamRuntime = require('../../aTeam/variants/variantExecutionRuntime');
const syncytiumRuntime = require('../../syncytium/variants/variantToolRouter');
const { canonicalVariant } = require('./variantIdentity');

function projectEntries(input) {
  const { source, definitions, createParameters, maturityFor = () => 'implemented' } = input;
  return Object.entries(definitions).map(([variantId, definition]) => ({
    variantId,
    parameters: createParameters(variantId, definition),
    maturity: maturityFor(definition, variantId),
    source
  }));
}

function topologyVariants(topology) {
  const loader = TOPOLOGY_LOADERS[topology];
  return loader ? loader() : [];
}

const TOPOLOGY_LOADERS = Object.freeze({
  a_team: () => projectEntries({ source: 'aTeam/variants/variantRegistry', definitions: aTeam.VARIANTS,
    createParameters: (_id, policy) => policy, maturityFor: aTeamVariantMaturity }),
  trinity: () => projectEntries({
    source: 'trinityVariantService', definitions: trinity.DEFINITIONS,
    createParameters: (_id, definition) => definition.design,
    maturityFor: trinityVariantMaturity
  }),
  biocenose: () => projectEntries({
    source: 'biocenose/variants/variantPolicyRouter', definitions: biocenose.POLICIES,
    createParameters: (_id, policy) => policy,
    maturityFor: (_policy, variantId) => biocenose.supports(variantId) ? 'implemented' : 'partial'
  }),
  holobionte: holobionteVariants,
  syncytium: syncytiumVariants,
  rhizome: () => rhizome.list().map((variantId) => ({
    variantId, parameters: rhizome.resolve(variantId), maturity: rhizome.supports(variantId) ? 'implemented' : 'partial',
    source: 'rhizome/variants/variantPolicyService'
  })),
  metapopulation: () => projectEntries({
    source: 'metapopulation/policy/metapopulationPolicyService',
    definitions: metapopulation.VARIANTS, createParameters: (_id, policy) => policy,
    maturityFor: (_definition, variantId) => metapopulationMaturity.maturityForVariant(variantId)
  }),
  biome: () => projectEntries({
    source: 'biome/variants/variantPolicyService', definitions: biome.DEFINITIONS,
    createParameters: (_id, policy) => policy,
    maturityFor: (_definition, variantId) => biomeVariantMaturity(variantId)
  })
});

function resolveTopologyVariant(topology, requested) {
  const variants = topologyVariants(topology);
  const variantId = canonicalVariant(topology, requested, variants.map((item) => item.variantId));
  return variantId ? variants.find((item) => item.variantId === variantId) || null : null;
}

function aTeamVariantMaturity(definition, variantId) {
  return aTeamRuntime.supportsVariant(variantId) ? definition.maturity || 'implemented' : 'partial';
}

function trinityVariantMaturity(definition) {
  try {
    return trinity.compileExperimentalDesign(definition.design).maturity;
  } catch (error) {
    if (error.code === 'TRINITY_POLICY_NOT_IMPLEMENTED') return 'conceptual';
    throw error;
  }
}

function biomeVariantMaturity(variantId) {
  try {
    biome.resolve(variantId);
  } catch (_) {
    return 'partial';
  }
  return biomeRuntime.supports(variantId) ? 'implemented' : 'partial';
}

function holobionteVariants() {
  const maturity = require('../../holobionte/variants/variantMaturityService');
  return holobionte.names.map((variantId) => {
    const policy = holobionte.getVariant(variantId);
    const assessment = maturity.maturityFor(policy);
    return {
      variantId: policy.name,
      parameters: {
        host: policy.configureHost(), admission: policy.configureAdmission(),
        resources: policy.configureResources(), immune: policy.configureImmunePolicy(),
        transmission: policy.configureTransmission(), succession: policy.configureSuccession(),
        stopConditions: policy.configureStopConditions(), placement: policy.configurePlacement(),
        memory: policy.configureMemory(), competition: policy.configureCompetition(),
        tool: policy.configureTool(), synchronization: policy.configureSynchronization()
      },
      maturity: assessment.maturity,
      maturityReasons: assessment.reasons,
      maturityEvidence: { operations: assessment.evidence.operations },
      source: 'holobionte/variants'
    };
  });
}

function syncytiumVariants() {
  return syncytium.listPolicies().map((entry) => {
    const policy = syncytium.getPolicy(entry.id);
    return {
      variantId: entry.id,
      requiredCapabilities: entry.requiredCapabilities,
      parameters: {
        replication: policy.configureReplication(), repair: policy.configureRepair(),
        stopConditions: policy.configureStopConditions()
      },
      maturity: syncytiumRuntime.supportsVariant(entry.id) ? 'implemented' : 'partial',
      source: 'syncytium/variants/variantPolicyRegistry'
    };
  });
}

module.exports = { topologyVariants, resolveTopologyVariant };
