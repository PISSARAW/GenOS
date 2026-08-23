export function createLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const versions = new Map([...balances.keys()].map((account) => [account, 0]));
  const events = new Map();

  return {
    applyBatch(batch) {
      const accepted = [];
      for (const event of batch) {
        if (!balances.has(event.account)) throw new Error('unknown account');
        balances.set(event.account, balances.get(event.account) + event.delta);
        versions.set(event.account, event.version);
        events.set(event.id, event);
        accepted.push(event.id);
      }
      return accepted;
    },
    balance(account) { return balances.get(account); },
    version(account) { return versions.get(account); },
    event(id) { return events.get(id); },
  };
}
