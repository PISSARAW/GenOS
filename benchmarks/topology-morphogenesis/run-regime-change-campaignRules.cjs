'use strict';

function selectFrozen(context) {
  return context.plan.training.candidateTopologies.map((topology) => {
      const subset = context.rows.filter((a) => a.topology === topology);
      const valid = subset.filter((attempt) => attempt.error == null && attempt.parsePassed === true
        && attempt.servedModelOk === true && attempt.budgetOk === true
        && context.Number.isFinite(context.Number(attempt.tokenUsage?.total)));
      const passed = valid.filter((a) => a.oraclePassed === true).length;
      const tokens = valid.reduce((s, a) => s + context.Number(a.tokenUsage.total), 0);
      return { topology, passed, total: subset.length, tokens };
    }).sort((a, b) => b.passed - a.passed || a.tokens - b.tokens || (a.topology < b.topology ? -1 : 1));
}

module.exports = { selectFrozen };
