'use strict';

const aTeam = require('../../aTeam/variants/variantRegistry');
const biocenose = require('../../biocenose/variants/variantPolicyRouter');
const holobionte = require('../../holobionte/variants');
const syncytium = require('../../syncytium/variants/variantPolicyRegistry');
const rhizome = require('../../rhizome/variants/variantPolicyService');
const metapopulation = require('../../metapopulation/policy/metapopulationPolicyService');
const biome = require('../../biome/variants/variantPolicyService');
const trinity = require('../../trinityVariantService');

function projectEntries(input) {
  const { source, definitions, createParameters, maturityFor = () => 'implemented' } = input;
  return Object.entries(definitions).map(([variantId, definition]) => ({
    variantId,
    parameters: createParameters(variantId, definition),
    maturity: maturityFor(definition),
    source
  }));
}

function topologyVariants(topology) {
  if (topology === 'a_team') return projectEntries({ source: 'aTeam/variants/variantRegistry', definitions: aTeam.VARIANTS, createParameters: (_id, policy) => policy });
  if (topology === 'trinity') return projectEntries({
    source: 'trinityVariantService', definitions: trinity.DEFINITIONS,
    createParameters: (_id, definition) => definition.design,
    maturityFor: trinityVariantMaturity
  });
  if (topology === 'biocenose') return projectEntries({
    source: 'biocenose/variants/variantPolicyRouter', definitions: biocenose.POLICIES,
    createParameters: (_id, policy) => policy,
    maturityFor: (policy) => policy.executionLevel === 'PARTIAL' ? 'partial' : 'implemented'
  });
  if (topology === 'holobionte') return holobionteVariants();
  if (topology === 'syncytium') return syncytiumVariants();
  if (topology === 'rhizome') return rhizome.list().map((variantId) => ({
    variantId, parameters: rhizome.resolve(variantId), maturity: 'implemented', source: 'rhizome/variants/variantPolicyService'
  }));
  if (topology === 'metapopulation') return projectEntries({
    source: 'metapopulation/policy/metapopulationPolicyService',
    definitions: metapopulation.VARIANTS, createParameters: (_id, policy) => policy
  });
  if (topology === 'biome') return projectEntries({
    source: 'biome/variants/variantPolicyService', definitions: biome.DEFINITIONS,
    createParameters: (_id, policy) => policy,
    maturityFor: () => 'partial'
  });
  return [];
}

function trinityVariantMaturity(definition) {
  try {
    return trinity.compileExperimentalDesign(definition.design).maturity;
  } catch (error) {
    if (error.code === 'TRINITY_POLICY_NOT_IMPLEMENTED') return 'conceptual';
    throw error;
  }
}

function holobionteVariants() {
  return holobionte.names.map((variantId) => {
    const policy = holobionte.getVariant(variantId);
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
      maturity: 'partial',
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
      maturity: 'implemented',
      source: 'syncytium/variants/variantPolicyRegistry'
    };
  });
}

module.exports = { topologyVariants };
