'use strict';

const { collection, invalid, sameScope, scope, text } = require('./validate');
const { digest } = require('./canonical');

// Advisory beta-binomial summary. No sample, interaction or trust is synthesized
// from a social preset. A high posterior NEVER grants capabilities or truth.
function summarize(observations, query) {
  collection(observations, 'observations', 10000);
  scope(query.scope);
  text(query.subjectId, 'subjectId');
  text(query.domain, 'domain');
  const seen = new Map();
  let successes = 0;
  let failures = 0;
  for (const observation of observations) {
    if (!relevant(observation, query)) continue;
    text(observation.id, 'observation.id');
    const hash = digest(observation);
    if (seen.has(observation.id)) {
      if (seen.get(observation.id) !== hash) invalid('observation.idempotency.conflict');
      continue;
    }
    seen.set(observation.id, hash);
    if (observation.outcome === 'pass') successes += 1;
    else if (observation.outcome === 'fail') failures += 1;
    else invalid('observation.outcome');
  }
  const n = successes + failures;
  return {
    subjectId: query.subjectId, domain: query.domain, n, successes, failures,
    alpha: successes + 1, beta: failures + 1,
    posteriorMean: n === 0 ? null : (successes + 1) / (n + 2),
    status: n === 0 ? 'unknown' : 'advisory_estimate',
    observationIds: [...seen.keys()].sort()
  };
}
function qualified(observation, subjectId) {
  return observation.validated === true && observation.independentEvaluator === true
    && typeof observation.evaluatorId === 'string' && observation.evaluatorId.length > 0
    && observation.evaluatorId !== subjectId
    && typeof observation.receiptId === 'string' && observation.receiptId.length > 0;
}
function relevant(observation, query) {
  return sameScope(observation.scope, query.scope) && observation.subjectId === query.subjectId
    && observation.domain === query.domain && qualified(observation, query.subjectId);
}

module.exports = { summarize };
