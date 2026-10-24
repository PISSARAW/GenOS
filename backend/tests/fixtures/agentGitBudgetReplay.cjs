'use strict';

module.exports = async ({ state, fixtures, seed, now }) => {
  const budget = state.runs.reduce((total, run) => {
    const item = JSON.parse(run.budget_json);
    return total + item.consumed;
  }, 0);
  return { pass: budget <= fixtures.maxConsumed, evidence: { budget, seed, now, pid: process.pid } };
};
