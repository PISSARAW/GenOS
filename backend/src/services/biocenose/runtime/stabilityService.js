'use strict';

const communityStore = require('../communityStore');
const assessment = require('../judgment/outcomeAssessment');
const { canonicalize } = require('../governance/protocolVersioning');

async function observe(context) {
  const current = context.priorResults[6];
  if (!assessment.ready(current)) return { stableRoundCount: 0 };
  const events = await communityStore.listEvents(context.db, context.communityId);
  const hash = require('../governance/protocolVersioning').constitutionHash(context.constitution);
  const rounds = events.filter((event) => event.type === 'DELIBERATION_STEP_COMPLETED'
    && event.payload.step === 'aggregate_by_question_type' && event.payload.result
    && event.payload.constitutionHash === hash
    && event.payload.round < context.session.round);
  let count = 1;
  let expectedRound = context.session.round - 1;
  for (const event of rounds.toReversed()) {
    if (event.payload.round !== expectedRound || !equivalent(current, event.payload.result)) break;
    count += 1;
    expectedRound -= 1;
  }
  return { stableRoundCount: count, basis: 'persisted_aggregation_results' };
}

function equivalent(left, right) {
  return signature(left) === signature(right);
}

function signature(value) {
  const projection = { outcome: value.outcome, questionType: value.questionType,
    estimates: value.estimates, options: value.options, perspectives: value.perspectives,
    claimStatements: value.claimStatements,
    distribution: value.representative?.distribution, delphi: value.delphi?.distribution,
    results: value.results?.map((entry) => signature(entry.result)),
    clusters: value.polycentric?.clusters?.map((item) => ({ outcome: item.outcome, distribution: item.distribution })),
    claims: value.claims?.map((item) => item.claim?.statement || item.statement),
    unresolvedCount: value.unresolvedClaimIds?.length || 0 };
  return JSON.stringify(canonicalize(projection));
}

module.exports = { observe, equivalent };
