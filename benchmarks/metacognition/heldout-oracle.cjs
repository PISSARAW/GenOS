'use strict';

const fs = require('node:fs');

function expected(problem) {
  if (problem.domain === 'arithmetic') {
    const [a, b, c] = problem.values;
    return (a + b) * c;
  }
  if (problem.domain === 'logic') {
    const [p, q, r] = problem.values;
    return Number(q ? r : p);
  }
  if (problem.domain !== 'records') throw Error('Unknown oracle domain');
  let total = 0;
  for (const row of problem.rows) if (row.label === problem.label) total += row.amount;
  return total;
}

function evaluate(input) {
  const target = expected(input.problem);
  return { caseId: input.problem.caseId, expected: target, observed: input.answer,
    correct: typeof input.answer === 'number' && Number.isFinite(input.answer) && input.answer === target };
}

if (require.main === module) {
  try { console.log(JSON.stringify(evaluate(JSON.parse(fs.readFileSync(0, 'utf8'))))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { expected, evaluate };
