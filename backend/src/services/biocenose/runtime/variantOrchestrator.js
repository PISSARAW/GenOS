'use strict';

const maliciousSignals = require('../byzantine/maliciousSignalDetector');
const byzantineQuorum = require('../byzantine/byzantineQuorumService');
const quarantineService = require('../byzantine/quarantineService');

async function delphiContext(input) {
  if (input.session.round < 1) return null;
  const commitment = require('../deliberation/commitmentService');
  const argumentsGraph = require('../argumentation/communityArgumentGraph');
  const previous = await commitment.listRevealedJudgments({ db: input.db,
    communityId: input.session.communityId, round: input.session.round - 1 });
  const snapshot = await argumentsGraph.snapshot({ db: input.db,
    communityId: input.session.communityId, round: input.session.round - 1 });
  const counts = new Map();
  for (const item of previous) {
    const position = String(item.judgment.position ?? 'ABSTAIN');
    counts.set(position, (counts.get(position) || 0) + 1);
  }
  const memberPositions = new Map(previous.map((item) => [item.memberId, item.judgment.position]));
  return {
    feedback: { anonymous: true, distribution: [...counts].map(([position, count]) => ({ position, count })),
      arguments: snapshot.arguments.map(stripAttribution) },
    previousByMember: memberPositions
  };
}

function delphiRevisions(previousByMember, current) {
  return current.map((item) => {
    const before = previousByMember.get(item.memberId);
    const after = item.judgment.position;
    const changed = String(before) !== String(after);
    const reasonCodes = item.judgment.reasonCodes || [];
    const evidenceRefs = item.judgment.evidenceRefs || [];
    const rationale = require('../deliberation/revisionReasonClassifier').classify({ reasonCodes, evidenceRefs });
    return { memberId: item.memberId, previousPosition: before, newPosition: after,
      status: changed ? 'REVISED' : 'MAINTAINED', reasonCodes, evidenceRefs,
      rationale: reasonCodes.length ? rationale : { evidenceGrounded: false, socialSignalOnly: false, unclassified: true } };
  });
}

function stripAttribution(item) {
  const { createdBy, owners, ...value } = item;
  return value;
}

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
  const observed = active.map((member) => {
    const execution = input.modelExecutionByMember?.get(member.memberId);
    return execution?.provider ? { ...member, provider: execution.provider } : member;
  });
  const domains = byzantineQuorum.partitionFaultDomains({ members: observed, faultyAssumed });
  if (!quorum.honorsAssumption || !quorum.bftPossible || domains.domainCount < quorum.quorum
    || domains.providerDomainCount < quorum.quorum) {
    throw Object.assign(new Error('Byzantine quorum is not supported by the active independent fault domains.'), {
      code: 'BIOCENOSE_BYZANTINE_QUORUM_LOST', details: { quorum, domains }
    });
  }
  return { quorum, faultDomains: domains };
}

async function persistentContext(input) {
  const reputation = require('../calibration/persistentReputationService');
  const store = require('../calibration/calibrationStore');
  const records = await persistentRecords({ input, reputation, store });
  const tenures = input.session.members.map((member) => ({ memberId: member.memberId,
    missions: Number(member.missionsServed || member.tenureMissions) || 0 }));
  const rotation = reputation.antiEntrenchment({ tenures,
    maxTenureMissions: Number(input.maxTenureMissions) || 20 });
  const currentDomain = String(input.forecastDomain || input.session.questionType || 'general');
  const currentRecords = records.filter((item) => item.domain === currentDomain
    || !records.some((entry) => entry.memberId === item.memberId && entry.domain === currentDomain));
  const excluded = new Set([...currentRecords.filter((item) => item.decision === 'EXPEL').map((item) => item.memberId),
    ...rotation.rotate.map((item) => item.memberId)]);
  const forecasts = persistentForecasts({ input, currentRecords, excluded });
  return { forecasts, report: { members: records, rotation, excludedMemberIds: [...excluded] } };
}

async function persistentRecords({ input, reputation, store }) {
  const records = [];
  for (const member of input.session.members.filter((item) => item.status === 'ACTIVE')) {
    for (const domain of memberDomains(member, input.session.questionType)) {
      records.push(await persistentMemberRecord({ input, member, domain, reputation, store }));
    }
  }
  return records;
}

async function persistentMemberRecord({ input, member, domain, reputation, store }) {
  const history = await store.list(input.db, member.memberId, domain);
  const historical = history.length ? history : (member.calibrationHistory || []).filter((item) => item.domain === domain);
  const profile = reputation.domainReputation({ memberId: member.memberId, records: historical });
  const domainRecord = profile.domains.find((item) => item.domain === domain);
  const lastMission = Number(historical.at(-1)?.missionIndex || 0);
  const currentMission = Number(input.missionIndex) || Number(member.missionsServed) || lastMission;
  const elapsed = Math.max(0, currentMission - lastMission);
  const decayed = reputation.decayReputation({ reputation: domainRecord?.reputation,
    periodsElapsed: elapsed, halfLifeMissions: input.reputationHalfLifeMissions });
  const decision = reputation.membershipDecision({ reputation: decayed.decayedReputation,
    sampleCount: domainRecord?.sampleCount || 0 });
  return { memberId: member.memberId, domain, sampleCount: domainRecord?.sampleCount || 0,
    reputation: domainRecord?.reputation ?? null, decayedReputation: decayed.decayedReputation,
    periodsElapsed: elapsed, missionIndex: currentMission,
    decision: decision.decision, reason: decision.reason };
}

function persistentForecasts({ input, currentRecords, excluded }) {
  const weights = new Map(currentRecords.map((item) => [item.memberId, Math.max(0.05, item.decayedReputation ?? 0.5)]));
  const source = input.suppliedForecasts || (input.judgments || []).flatMap((item) => (item.judgment.probabilities || [])
    .map((forecast) => ({ ...forecast, memberId: item.memberId })));
  return source.filter((item) => !excluded.has(item.memberId)).map((item) => ({
    ...item, calibrationWeight: weights.get(item.memberId) ?? item.calibrationWeight,
    independenceWeight: item.independenceWeight || 1
  }));
}

function memberDomains(member, fallback) {
  const expertise = Array.isArray(member.expertise) ? member.expertise : [member.expertise];
  const values = expertise.filter((value) => typeof value === 'string' && value.trim());
  return [...new Set(values.length ? values : [String(fallback || 'general')])];
}

async function forecastingContext(input) {
  const store = require('../calibration/calibrationStore');
  const members = new Map(input.session.members.map((item) => [item.memberId, item]));
  const source = input.suppliedForecasts || (input.judgments || []).flatMap((item) =>
    (item.judgment.probabilities || []).map((forecast) => ({ ...forecast, memberId: item.memberId })));
  const cache = new Map();
  const weights = new Map();
  const forecasts = [];
  for (const forecast of source) {
    const { domain, key, weight } = await forecastProfile({ input, forecast, members, cache, store });
    weights.set(key, { memberId: forecast.memberId, ...weight });
    forecasts.push({ ...forecast, domain, calibrationWeight: forecast.calibrationWeight ?? weight.calibrationWeight,
      independenceWeight: forecast.independenceWeight ?? weight.independenceWeight });
  }
  return { forecasts, weights: [...weights.values()],
    missingMemberIds: [...new Set([...weights.values()]
      .filter((item) => !(item.calibrationWeight > 0)).map((item) => item.memberId))] };
}

async function forecastProfile({ input, forecast, members, cache, store }) {
  const member = members.get(forecast.memberId);
  const domain = String(forecast.domain || member?.forecastDomain
    || (typeof member?.expertise === 'string' ? member.expertise : input.session.questionType) || 'general');
  const key = `${forecast.memberId}:${domain}`;
  if (!cache.has(key)) cache.set(key, await loadForecastWeight({ input, forecast, member, domain, store }));
  return { domain, key, weight: cache.get(key) };
}

async function loadForecastWeight({ input, forecast, member, domain, store }) {
  const stored = await store.list(input.db, forecast.memberId, domain);
  const history = stored.length ? stored : (member?.calibrationHistory || []).filter((item) => item.domain === domain);
  const meanBrier = mean(history.map((item) => Number(item.brierScore)).filter(Number.isFinite));
  const explicit = Number(member?.calibrationWeight ?? member?.calibration);
  const calibrationWeight = meanBrier === null
    ? (Number.isFinite(explicit) && explicit > 0 ? explicit : null)
    : Math.max(0, 1 - meanBrier);
  return { domain, calibrationWeight,
    independenceWeight: Number(member?.independenceWeight) > 0 ? Number(member.independenceWeight) : 1,
    sampleCount: history.length };
}
function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function scoreResolvedForecasts(forecasts, outcomes) {
  const resolved = new Map(outcomes.map((item) => [item.eventId, Number(item.outcome)]));
  const scores = forecasts.filter((item) => resolved.has(item.eventId)
    && Number.isFinite(item.probability) && item.probability >= 0 && item.probability <= 1
    && [0, 1].includes(resolved.get(item.eventId)))
    .map((item) => ({ memberId: item.memberId, eventId: item.eventId,
      brierScore: (item.probability - resolved.get(item.eventId)) ** 2 }));
  return { scores, meanBrier: mean(scores.map((item) => item.brierScore)), resolvedCount: scores.length };
}

async function persistResolvedOutcomes(input) {
  const calibration = require('../calibration/calibrationService');
  const recorded = [];
  for (const outcome of input.outcomes || []) {
    if (!eligibleOutcome(outcome, input.isTrustedReceipt)) continue;
    const oracleRef = outcome.oracleRef || outcome.receipt.receiptId || outcome.receipt.reference;
    const forecasts = matchingForecasts(input.forecasts, outcome);
    if (!oracleRef || !forecasts.length) continue;
    recorded.push(await calibration.recordResolution({ db: input.db, communityId: input.communityId,
      actorId: input.actorId, eventId: outcome.eventId, domain: outcome.domain,
      outcome: Number(outcome.outcome), oracleRef, forecasts }));
  }
  return recorded;
}

function eligibleOutcome(outcome, validator) {
  return Boolean(outcome.eventId && outcome.domain && [0, 1].includes(Number(outcome.outcome))
    && trustedReceipt(outcome.receipt, validator));
}

function matchingForecasts(forecasts, outcome) {
  return forecasts.filter((item) => item.eventId === outcome.eventId
    && item.domain === outcome.domain && typeof item.memberId === 'string'
    && Number.isFinite(item.probability) && item.probability >= 0 && item.probability <= 1);
}

function trustedReceipt(receipt, validator) {
  if (!receipt || receipt.status !== 'VERIFIED' || typeof validator !== 'function') return false;
  try { return validator(receipt) === true; } catch (_) { return false; }
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
    const responses = await localCouncilResponses(input, council);
    clusters.push(localCouncilOutcome(council.councilId, responses));
  }
  const federated = councilService.federate({ clusters,
    delegatesPerCluster: input.context.aggregationContext?.delegatesPerCouncil || 2 });
  return { policy: 'hierarchical', questionType: input.session.questionType,
    outcome: federated.parentMustReview ? 'REVIEW_REQUIRED' : 'POLYCENTRIC_JUDGMENT',
    polycentric: { councils, clusters, ...federated } };
}

async function localCouncilResponses(input, council) {
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
  return responses;
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

module.exports = { quarantineIfRequired, assertByzantineQuorum, persistentContext, aggregatePolycentric,
  delphiContext, delphiRevisions, forecastingContext, scoreResolvedForecasts, persistResolvedOutcomes };
