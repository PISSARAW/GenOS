'use strict';

function selectFrozenValue1(__genosValueScope1) {
  return __genosValueScope1.plan.training.candidateTopologies.map((topology) => {
      const subset = __genosValueScope1.rows.filter((a) => a.topology === topology);
      const valid = subset.filter((attempt) => attempt.error == null && attempt.parsePassed === true
        && attempt.servedModelOk === true && attempt.budgetOk === true
        && __genosValueScope1.Number.isFinite((0, __genosValueScope1.Number)(attempt.tokenUsage?.total)));
      const passed = valid.filter((a) => a.oraclePassed === true).length;
      const tokens = valid.reduce((s, a) => s + (0, __genosValueScope1.Number)(a.tokenUsage.total), 0);
      return { topology, passed, total: subset.length, tokens };
    }).sort((a, b) => b.passed - a.passed || a.tokens - b.tokens || (a.topology < b.topology ? -1 : 1));
}

module.exports = { selectFrozenValue1 };
