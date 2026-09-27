'use strict';

function composeDeltas(deltas) {
  return (Array.isArray(deltas) ? deltas : []).reduce((total, delta) => {
    for (const [key, value] of Object.entries(delta || {})) total[key] = (total[key] || 0) + Number(value || 0);
    return total;
  }, {});
}

function planControlledRollout(input) {
  const data = input || {};
  const branches = Array.isArray(data.branches) ? data.branches : [];
  if (branches.length < 2) throw Object.assign(new Error('At least two rollout branches are required'), { code: 'INSUFFICIENT_BRANCHES' });
  const ranked = branches.map((branch) => ({ ...branch, score: Number(branch.observedScore) || 0 })).sort((a, b) => b.score - a.score);
  const selected = ranked[0];
  return { selected, ranked, composedDelta: composeDeltas(selected.deltas), rollback: { token: `rollback_${data.rolloutId || Date.now()}`, stateBefore: data.stateBefore || null }, policyFlip: Boolean(data.policyFlip), reversible: true };
}

function observeRollout(plan, observation) {
  const expected = plan?.selected?.expectedDelta || {};
  const actual = observation?.delta || {};
  const errors = Object.keys(expected).filter((key) => Number(expected[key]) !== Number(actual[key]));
  return { matched: errors.length === 0, errors, rollbackRequired: errors.length > 0 };
}

module.exports = { composeDeltas, planControlledRollout, observeRollout };
