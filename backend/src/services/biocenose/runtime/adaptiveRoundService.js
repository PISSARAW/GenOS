'use strict';

const communityStore = require('../communityStore');
const recruitment = require('../formation/adaptiveRecruitmentService');

async function prepareNext(input, session) {
  const events = await communityStore.listEvents(input.db, input.communityId);
  const revision = events.filter((event) => event.type === 'DELIBERATION_STEP_COMPLETED'
    && event.payload.round === session.round && event.payload.step === 'collect_belief_revisions').at(-1);
  const reblind = revision?.payload.result.updates?.some((item) => item.groupthinkRisk === true);
  const report = await formNextRound(input, session, reblind);
  await communityStore.appendEvent(input.db, { communityId: input.communityId, actorId: input.actorId,
    type: 'ADAPTIVE_ROUND_PREPARED', payload: { round: session.round + 1, reblind, recruitment: report },
    patch: { phase: 'SEALED_JUDGMENT', round: session.round + 1 } });
  return communityStore.loadSession(input.db, input.communityId);
}

async function formNextRound(input, session, reblind) {
  if (!input.recruitmentCandidates?.length) return null;
  await communityStore.appendEvent(input.db, { communityId: input.communityId, actorId: input.actorId,
    type: 'PHASE_CHANGED', payload: { from: session.phase, to: 'FORMATION', reason: 'ADAPTIVE_RECRUITMENT' },
    patch: { phase: 'FORMATION' } });
  return recruitment.recruit({ ...input, candidates: input.recruitmentCandidates,
    minimumProviders: input.minimumProviders, roleTargets: input.roleTargets,
    diversityRole: reblind ? 'reviewer' : input.diversityRole });
}

module.exports = { prepareNext };
