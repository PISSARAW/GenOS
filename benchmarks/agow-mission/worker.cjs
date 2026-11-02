'use strict';

async function main() {
  let text = '';
  for await (const chunk of process.stdin) text += chunk;
  const { orders, fault } = JSON.parse(text);
  const totals = new Map();
  for (const order of orders.filter((item) => item.quantity > 0)) {
    totals.set(order.customer, (totals.get(order.customer) || 0) + order.quantity);
  }
  const answer = [...totals].sort(([a], [b]) => a.localeCompare(b));
  if (fault) answer[0][1] += 1;
  process.stdout.write(JSON.stringify(answer));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
