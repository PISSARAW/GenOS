'use strict';

const maliciousSignals = require('../byzantine/maliciousSignalDetector');
const byzantineQuorum = require('../byzantine/byzantineQuorumService');
const quarantineService = require('../byzantine/quarantineService');

async function quarantineIfRequired(input) {
  if (!input.variantPolicy?.quarantineAware) return null;
  const nested = input.judgment?.judgment || input.judgment || {};
  const signal = maliciousSignals.inspect({ confidence: nested.confidence,
    evidenceRefs: nested.evidenceRefs, forecasts: nested.probabilities || nested.forecasts });
  const trust = byzantineQuorum.admitMember({ member: input.member, members: input.session.members,
    signalFlags: signal.flags, trust: input.member.trust, periodsMissed: input.member.periodsMissed });
  if (trust.verdict === 'ADMIT') return null;
  await quarantineService.setStatus({ db: input.db, communityId: input.session.communityId,
    actorId: input.actorId, memberId: input.member.memberId, quarantined: true,
    reason: trust.reason || signal.flags.join(',') });
  return { memberId: input.member.memberId, verdict: trust.verdict, reason: trust.reason, flags: signal.flags };
}

function assertByzantineQuorum(input) {
  const active = input.session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const faultyAssumed = Number(input.faultyAssumed ?? input.constitution?.faultyAssumed ?? 1);
  const quorum = byzantineQuorum.quorumFor({ memberCount: active.length, faultyAssumed });
  const domains = byzantineQuorum.partitionFaultDomains({ members: active, faultyAssumed });
  if (!quorum.honorsAssumption || !quorum.bftPossible || domains.domainCount < quorum.quorum) {
    throw Object.assign(new Error('Byzantine quorum is not supported by the active independent fault domains.'), {
      code: 'BIOCENOSE_BYZANTINE_QUORUM_LOST', details: { quorum, domains }
    });
  }
  return { quorum, faultDomains: domains };
}

async function persistentContext(input) {
  const reputation = require('../calibration/persistentReputationService');
  const store = require('../calibration/calibrationStore');
  const records = [];
  for (const member of input.session.members.filter((item) => item.status === 'ACTIVE')) {
    const domain = String(member.expertise || input.session.questionType || 'general');
    const history = await store.list(input.db, member.memberId, domain);
    const profile = reputation.domainReputation({ memberId: member.memberId, records: history });
    const domainRecord = profile.domains.find((item) => item.domain === domain);
    const lastMission = Number(history.at(-1)?.missionIndex || 0);
    const elapsed = Math.max(0, (Number(input.missionIndex) || lastMission) - lastMission);
    const decayed = reputation.decayReputation({ reputation: domainRecord?.reputation,
      periodsElapsed: elapsed, halfLifeMissions: input.reputationHalfLifeMissions });
    const decision = reputation.membershipDecision({ reputation: decayed.decayedReputation,
      sampleCount: domainRecord?.sampleCount || 0 });
    records.push({ memberId: member.memberId, domain, sampleCount: domainRecord?.sampleCount || 0,
      reputation: domainRecord?.reputation ?? null, decayedReputation: decayed.decayedReputation,
      periodsElapsed: elapsed, decision: decision.decision, reason: decision.reason });
  }
  const tenures = input.session.members.map((member) => ({ memberId: member.memberId,
    missions: Number(member.missionsServed || member.tenureMissions) || 0 }));
  const rotation = reputation.antiEntrenchment({ tenures,
    maxTenureMissions: Number(input.maxTenureMissions) || 20 });
  const excluded = new Set([...records.filter((item) => item.decision === 'EXPEL').map((item) => item.memberId),
    ...rotation.rotate.map((item) => item.memberId)]);
  const weights = new Map(records.map((item) => [item.memberId, Math.max(0.05, item.decayedReputation ?? 0.5)]));
  const source = input.suppliedForecasts || (input.judgments || []).flatMap((item) => (item.judgment.probabilities || [])
    .map((forecast) => ({ ...forecast, memberId: item.memberId })));
  const forecasts = source.filter((item) => !excluded.has(item.memberId)).map((item) => ({
    ...item, calibrationWeight: weights.get(item.memberId) ?? item.calibrationWeight,
    independenceWeight: item.independenceWeight || 1
  }));
  return { forecasts, report: { members: records, rotation, excludedMemberIds: [...excluded] } };
}

async function aggregatePolycentric(input) {
  const councilService = require('../deliberation/polycentricCouncilService');
  const members = input.session.members.filter((member) => member.status === 'ACTIVE'
    && member.role !== 'community_facilitator');
  const councils = councilService.composeSubCouncils({ members,
    councilCount: input.context.aggregationContext?.councilCount || Math.min(3, members.length),
    scope: input.context.aggregationContext?.scope || 'mission', specializeByExpertise: true });
  const clusters = [];
  for (const council of councils) {
    const responses = [];
    for (const memberId of council.memberIds) {
      const member = input.session.members.find((item) => item.memberId === memberId);
      const response = await input.invokeMember(input.context, {
        member, phase: 'LOCAL_COUNCIL_JUDGMENT',
        task: 'Return this local council\'s position, reasons, and any dissent as JSON.',
        details: { council, claims: (input.claims || []).map(stripOwner),
          reviews: (input.reviews || []).map((item) => item.review) }
      });
      responses.push({ memberId, outcome: String(response.outcome || response.position || 'ABSTAIN'), dissent: response.dissent });
    }
    clusters.push(localCouncilOutcome(council.councilId, responses));
  }
  const federated = councilService.federate({ clusters,
    delegatesPerCluster: input.context.aggregationContext?.delegatesPerCouncil || 2 });
  return { policy: 'hierarchical', questionType: input.session.questionType,
    outcome: federated.parentMustReview ? 'REVIEW_REQUIRED' : 'POLYCENTRIC_JUDGMENT',
    polycentric: { councils, clusters, ...federated } };
}

function localCouncilOutcome(clusterId, responses) {
  const counts = new Map();
  for (const response of responses) counts.set(response.outcome, (counts.get(response.outcome) || 0) + 1);
  const distribution = [...counts].map(([position, memberCount]) => ({
    position, memberCount, share: responses.length ? memberCount / responses.length : 0
  }));
  const outcome = [...distribution].sort((left, right) => right.memberCount - left.memberCount)[0]?.position || 'ABSTAIN';
  const dissent = responses.flatMap((item) => item.dissent ? [{ memberId: item.memberId, dissent: item.dissent }] : []);
  return { clusterId, outcome, distribution, dissent, minorityEvidenceBypass: [] };
}

function stripOwner(claim) {
  const { createdBy, ...value } = claim;
  return value;
}

module.exports = { quarantineIfRequired, assertByzantineQuorum, persistentContext, aggregatePolycentric };
