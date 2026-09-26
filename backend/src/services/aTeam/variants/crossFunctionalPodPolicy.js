'use strict';

const { createHash } = require('crypto');

function crossFunctionalPodFullPotential(mission, members) {
  const owners = buildOwners(members);
  const externalDependencies = collectExternalDependencies(members);
  const externalLimit = resolveExternalLimit(mission, members);
  const autonomyScore = computeAutonomyScore(externalDependencies, externalLimit);

  validateOwnershipUniqueness(owners);
  validateDependencyLimit(externalDependencies, externalLimit);

  return {
    limit_external_dependencies: {
      limit: externalLimit,
      actualCount: externalDependencies.length,
      dependencies: externalDependencies,
      enforced: true
    },
    artifact_ownership: {
      owners,
      ownershipConflictCheck: 'passed',
      verificationRequired: true
    },
    full_design_build_test_ship: {
      design: true,
      build: true,
      test: true,
      ship: true,
      operate: mission.includeOperate === true,
      endToEndOwnership: true
    },
    autonomy_metric: {
      score: autonomyScore,
      threshold: 0.7,
      dependencies: externalDependencies.length,
      limit: externalLimit,
      trend: autonomyScore >= 0.7 ? 'healthy' : autonomyScore >= 0.5 ? 'watch' : 'critical'
    },
    contractual_boundaries: {
      internalContracts: buildInternalContracts(members),
      externalContracts: buildExternalContracts(mission, members),
      boundaryViolations: []
    },
    continuous_sync: {
      enabled: mission.continuousSync !== false,
      cadence: mission.syncCadence || 'continuous',
      peerDomainConsultation: true
    }
  };
}

function buildOwners(members) {
  const owners = [];
  const allArtifacts = [];
  for (const member of members) {
    const artifacts = member.ownedResponsibilities || [];
    for (const artifact of artifacts) {
      if (allArtifacts.includes(artifact)) {
        throw new Error(`Artifact '${artifact}' has multiple owners.`);
      }
      allArtifacts.push(artifact);
      owners.push({
        artifact,
        owner: member.memberId || member.agentId || member.workerId,
        lifecycle: member.artifactLifecycle || 'design_to_ship',
        verificationRequired: true
      });
    }
  }
  return owners;
}

function collectExternalDependencies(members) {
  return [...new Set(members.flatMap((m) => m.externalDependencies || []))];
}

function resolveExternalLimit(mission, members) {
  if (Number.isFinite(mission.externalDependencyLimit)) return mission.externalDependencyLimit;
  return members.length >= 3 ? 0 : 2;
}

function computeAutonomyScore(deps, limit) {
  if (deps.length === 0) return 1;
  return Math.max(0, 1 - deps.length / (limit || 1));
}

function validateOwnershipUniqueness(owners) {
  const seen = new Set();
  for (const owner of owners) {
    if (seen.has(owner.artifact)) {
      throw new Error(`Duplicate artifact ownership: ${owner.artifact}`);
    }
    seen.add(owner.artifact);
  }
}

function validateDependencyLimit(deps, limit) {
  if (deps.length > limit) {
    throw new Error(`Exceeds external dependency limit of ${limit}. Found ${deps.length}.`);
  }
}

function buildInternalContracts(members) {
  const contracts = [];
  for (const member of members) {
    const memberId = member.memberId || member.agentId || member.workerId;
    for (const contract of (member.internalContracts || [])) {
      contracts.push({
        from: memberId,
        to: contract.to,
        artifact: contract.artifact,
        schema: contract.schema,
        validated: false
      });
    }
  }
  return contracts;
}

function buildExternalContracts(mission, members) {
  const firstId = members[0] && (members[0].memberId || members[0].agentId || members[0].workerId);
  return (mission.externalContracts || []).map((c) => ({
    ...c,
    validated: false,
    owner: c.ownerId || firstId
  }));
}

module.exports = { crossFunctionalPodFullPotential };
