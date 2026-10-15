'use strict';
const data = require('./regime-change-task-set.json');
const oracles = require('./holdout-oracles/regime-change-oracles.cjs');

const holdout = data.tasks.filter((t) => t.split === 'holdout');
const training = data.tasks.filter((t) => t.split === 'training');
console.log(`tasks:${data.tasks.length} holdout:${holdout.length} training:${training.length}`);

let bad = 0;
for (const task of data.tasks) {
  let candidate = null;
  if (task.oracle === 'verifyCapacity') {
    const bins = Array.from({ length: task.oracleParams.bins }, () => []);
    const sums = Array.from({ length: task.oracleParams.bins }, () => 0);
    const items = [...task.oracleParams.items].sort((a, b) => b.w - a.w);
    for (const item of items) {
      let best = 0;
      for (let i = 1; i < bins.length; i += 1) if (sums[i] < sums[best]) best = i;
      bins[best].push(item.id);
      sums[best] += item.w;
    }
    candidate = { bins };
  } else if (task.oracle === 'verifyOrder') {
    const edges = [...task.oracleParams.edges, ...task.oracleParams.revealedEdges];
    const order = [];
    while (order.length < task.oracleParams.steps.length) {
      const used = new Set(order);
      const next = task.oracleParams.steps.find((s) => !used.has(s)
        && edges.filter((e) => e[1] === s).every((e) => used.has(e[0])));
      if (!next) break;
      order.push(next);
    }
    candidate = { order };
  } else {
    candidate = { tuples: oracles.expectedTuples(task.oracleParams).map((s) => s.split(',').map(Number)) };
  }
  const result = oracles.verifyRegimeCandidate(task, candidate);
  if (!result.passed) {
    bad += 1;
    console.log(`UNSOLVABLE: ${task.id} ${result.reason}`);
  }
}
console.log(bad === 0 ? 'all-solvable' : `${bad}-unsolvable`);
