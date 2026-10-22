'use strict';

const topologyKinds = require('../topologyWorkerKindService');
const { compileWorkGraph } = require('../aTeam/workGraph/workGraphCompiler');
const { validateMember } = require('../aTeam/contracts/memberContract');
const { validateHandoff } = require('../aTeam/contracts/handoffContract');
const { ownerFor, canModify } = require('../aTeam/responsibility/authorityMatrixService');
const { canonicalDigest } = require('../digitalEvidenceOrgan/deoContract');
const { canonicalValue } = require('../stateFingerprint');
const { SPECIALIST_ORDER, getSpecialistSpec } = require('./specialistCatalog');
const { instantiateSpecialistPhysiology, physiologyError } = require('./specialistContractService');
const { verifySpecialistOutput } = require('./specialistOutputVerifier');

function buildATeamCompatibleMember(spec, instance) {
  const member = {
    memberId: spec.specialistId,
    agentId: `agent:${spec.specialistId}`,
    workerId: `worker:${spec.specialistId}`,
    role: spec.role,
    domain: spec.specialistId,
    specialtyNiche: spec.nicheDomain,
    nicheDomain: spec.nicheDomain,
    expertise: [...spec.mandateScope.domains],
    capabilities: [...spec.declaredCapabilities],
    ownedResponsibilities: [...spec.responsibility.owns],
    consumes: [...spec.consumes],
    provides: [...spec.provides],
    consults: [...spec.responsibility.mustConsult],
    toolLease: [...instance.effectiveToolLease],
    authority: {
      owns: [...spec.responsibility.owns],
      mayModify: [...spec.responsibility.mayModify],
      mayPropose: [...spec.responsibility.mayPropose],
      mustConsult: [...spec.responsibility.mustConsult],
      mayRead: [...spec.responsibility.mayRead],
      cannotOverride: [...spec.responsibility.cannotOverride],
    },
    participationMode: spec.specialistId === 'independent_auditor' ? 'OBSERVER' : 'FULL',
    status: 'ACTIVE',
    dependsOn: [...spec.dependsOn],
    pipelineStage: spec.pipelineStage,
    mission: `${spec.title} — ${spec.mandate}`,
  };
  const check = validateMember(member);
  if (!check.valid) {
    throw physiologyError('SPECIALIST_MEMBER_CONTRACT_INVALID', check.errors.join(' '));
  }
  return member;
}

function buildSecuritySpecialistRoster(options = {}) {
  const requestedIds = Array.isArray(options.specialists) && options.specialists.length > 0
    ? options.specialists
    : SPECIALIST_ORDER;

  const rawMembers = requestedIds.map((id) => {
    const spec = getSpecialistSpec(id);
    const instance = instantiateSpecialistPhysiology(id, options);
    return buildATeamCompatibleMember(spec, instance);
  });

  const mappedMembers = topologyKinds.applyTopologyWorkerKinds('a_team', rawMembers);
  const workGraph = compileWorkGraph({
    workGraphId: options.workGraphId ?? 'workgraph:security-specialist-physiology',
    teamRunId: options.teamRunId ?? 'ateam:security-specialist-physiology',
    members: mappedMembers,
  });

  return Object.freeze({
    schema: 'genos.security-specialist-roster/v1',
    members: Object.freeze(mappedMembers),
    workGraph: Object.freeze(workGraph),
  });
}

function buildCollaborationHandoff(producerId, consumerId, receipt) {
  const producerSpec = getSpecialistSpec(producerId);
  const handoff = {
    handoffId: `handoff:${producerId}->${consumerId}`,
    type: consumerId === 'independent_auditor' ? 'VALIDATION' : 'DELIVERY',
    producer: { agentId: `agent:${producerId}`, role: producerId },
    consumer: { agentId: `agent:${consumerId}`, role: consumerId },
    version: 1,
    status: 'ACCEPTED',
    accepted: true,
    blocking: true,
    artifactRefs: [...producerSpec.provides],
    claimRefs: [`claim:${producerId}:primary`],
    evidenceRefs: [receipt.outputDigest],
    assumptions: [`Mandate bounded to: ${producerSpec.mandate}`],
    preconditions: ['DEO evidence integrity verified'],
    postconditions: [`Verified against ${receipt.schemaId}`],
  };
  const validation = validateHandoff(handoff);
  if (!validation.valid) {
    throw physiologyError('SPECIALIST_HANDOFF_INVALID', validation.errors.join(' '));
  }
  return Object.freeze(handoff);
}

function verifyResponsibilityBoundaries(members) {
  const seenScopes = new Map();
  for (const member of members) {
    for (const owned of member.ownedResponsibilities) {
      if (seenScopes.has(owned)) {
        throw physiologyError(
          'SPECIALIST_OVERLAPPING_OWNERSHIP',
          `Scope '${owned}' is claimed by both '${seenScopes.get(owned)}' and '${member.memberId}'.`,
        );
      }
      seenScopes.set(owned, member.memberId);
      const owner = ownerFor(owned, members);
      if (!owner || owner.memberId !== member.memberId) {
        throw physiologyError('SPECIALIST_AUTHORITY_OWNER_MISMATCH', `Owner mismatch for '${owned}'.`);
      }
    }
    for (const forbidden of member.authority.cannotOverride) {
      if (canModify(member, forbidden)) {
        throw physiologyError(
          'SPECIALIST_BOUNDARY_VIOLATION',
          `Specialist '${member.memberId}' can modify '${forbidden}' which it cannotOverride.`,
        );
      }
    }
  }
}

function runCollaborativeSecurityReview(specialistOutputs = {}, options = {}) {
  const roster = buildSecuritySpecialistRoster(options);
  verifyResponsibilityBoundaries(roster.members);

  const verifiedReceipts = {};
  for (const id of SPECIALIST_ORDER) {
    const payload = specialistOutputs[id];
    if (!payload) {
      throw physiologyError('SPECIALIST_OUTPUT_MISSING', `Missing output from specialist '${id}'.`);
    }
    verifiedReceipts[id] = verifySpecialistOutput(id, payload, options);
  }

  const handoffs = [];
  for (const consumerId of SPECIALIST_ORDER) {
    const spec = getSpecialistSpec(consumerId);
    for (const producerId of spec.dependsOn) {
      handoffs.push(buildCollaborationHandoff(producerId, consumerId, verifiedReceipts[producerId]));
    }
  }

  const auditorOutput = specialistOutputs.independent_auditor;
  const auditVerdict = String(auditorOutput.auditReport.independentVerdict).toLowerCase();
  const preservedContradictions = auditorOutput.auditReport.preservedContradictions;

  const summary = canonicalValue({
    schema: 'genos.security-specialist-collaboration/v1',
    specialists: SPECIALIST_ORDER,
    workGraphId: roster.workGraph.workGraphId,
    layers: roster.workGraph.layers,
    verifiedReceipts,
    handoffCount: handoffs.length,
    handoffs,
    independentAuditVerdict: auditVerdict,
    preservedContradictions,
    contradictionCount: preservedContradictions.length,
    promotionEligible: false,
    authorizesPromotion: false,
  });

  return Object.freeze({
    ...summary,
    collaborationDigest: canonicalDigest(summary),
  });
}

module.exports = {
  buildSecuritySpecialistRoster,
  verifyResponsibilityBoundaries,
  buildCollaborationHandoff,
  runCollaborativeSecurityReview,
};
