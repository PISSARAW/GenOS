'use strict';

const fs = require('node:fs');
const { digest } = require('../../backend/src/services/evidenceProtocol/canonical');

function evaluate(input) {
  if (input.outputDigest !== digest(input.answer)) throw new Error('Worker output digest mismatch.');
  const customers = [...new Set(input.orders.map((item) => item.customer))].sort();
  const expected = customers.map((customer) => [customer, input.orders
    .reduce((sum, row) => sum + (row.customer === customer && row.quantity > 0 ? row.quantity : 0), 0)])
    .filter(([, total]) => total > 0);
  const answer = Array.isArray(input.answer) ? input.answer : [];
  const errors = expected.filter((row, index) => JSON.stringify(row) !== JSON.stringify(answer[index])).length;
  const extras = Math.max(0, answer.length - expected.length);
  const loss = Math.min(1, (errors + extras) / expected.length);
  return { verified: true, verifierId: digest(fs.readFileSync(__filename, 'utf8')),
    bindingHash: input.bindingHash, eventDigest: input.eventDigest,
    evidenceRefs: [digest({ orders: input.orders, answer: input.answer })],
    metrics: { realizedLoss: loss, goalProgress: 1 - loss, resourceReserve: null,
      missionStability: null, blockageEvents: null, viabilityViolations: null } };
}

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  process.stdout.write(JSON.stringify(evaluate(JSON.parse(text))));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { evaluate };
