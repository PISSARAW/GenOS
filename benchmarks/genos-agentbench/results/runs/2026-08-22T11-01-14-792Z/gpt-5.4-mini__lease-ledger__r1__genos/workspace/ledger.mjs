export function createLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const versions = new Map([...balances.keys()].map((account) => [account, 0]));
  const events = new Map();

  const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
  const sameEvent = (a, b) =>
    a.id === b.id &&
    a.account === b.account &&
    a.delta === b.delta &&
    a.version === b.version;

  const cloneEvent = (event) => ({
    id: event.id,
    account: event.account,
    delta: event.delta,
    version: event.version,
  });

  return {
    applyBatch(batch) {
      if (!Array.isArray(batch)) throw new Error('invalid batch');

      const pendingById = new Map();
      const pending = [];

      for (const raw of batch) {
        if (!raw || typeof raw !== 'object') throw new Error('invalid event');
        const event = cloneEvent(raw);
        if (typeof event.id !== 'string' || typeof event.account !== 'string' || typeof event.delta !== 'number' || !Number.isFinite(event.delta) || !isPositiveInteger(event.version)) {
          throw new Error('invalid event');
        }

        const committed = events.get(event.id);
        if (committed) {
          if (!sameEvent(committed, event)) throw new Error('id collision');
          continue;
        }

        const duplicate = pendingById.get(event.id);
        if (duplicate) {
          if (!sameEvent(duplicate, event)) throw new Error('id collision');
          continue;
        }

        pendingById.set(event.id, event);
        pending.push(event);
      }

      const byAccount = new Map();
      for (const event of pending) {
        if (!balances.has(event.account)) throw new Error('unknown account');
        const committedVersion = versions.get(event.account);
        if (event.version <= committedVersion) continue;
        const list = byAccount.get(event.account);
        if (list) {
          list.push(event);
        } else {
          byAccount.set(event.account, [event]);
        }
      }

      const nextBalances = new Map(balances);
      const nextVersions = new Map(versions);
      const committedNow = [];

      for (const account of [...byAccount.keys()].sort()) {
        const list = byAccount.get(account).slice().sort((a, b) => a.version - b.version || a.id.localeCompare(b.id));
        let expectedVersion = nextVersions.get(account) + 1;
        let balance = nextBalances.get(account);

        for (const event of list) {
          if (event.version !== expectedVersion) throw new Error('version gap');
          balance += event.delta;
          if (balance < 0) throw new Error('negative balance');
          nextBalances.set(account, balance);
          nextVersions.set(account, event.version);
          committedNow.push(event);
          expectedVersion += 1;
        }
      }

      balances.clear();
      for (const [account, balance] of nextBalances) balances.set(account, balance);
      versions.clear();
      for (const [account, version] of nextVersions) versions.set(account, version);
      for (const event of committedNow) events.set(event.id, cloneEvent(event));

      return committedNow.map((event) => event.id);
    },
    balance(account) { return balances.get(account); },
    version(account) { return versions.get(account); },
    event(id) { return events.get(id); },
  };
}
