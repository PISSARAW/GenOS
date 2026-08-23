export function createLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const versions = new Map([...balances.keys()].map((account) => [account, 0]));
  const events = new Map();

  function isValidEvent(event) {
    return event !== null
      && typeof event === 'object'
      && typeof event.id === 'string'
      && event.id.length > 0
      && typeof event.account === 'string'
      && Number.isFinite(event.delta)
      && Number.isSafeInteger(event.version)
      && event.version > 0;
  }

  function hasSamePayload(left, right) {
    return left.id === right.id
      && left.account === right.account
      && Object.is(left.delta, right.delta)
      && left.version === right.version;
  }

  return {
    applyBatch(batch) {
      if (!Array.isArray(batch)) throw new Error('invalid batch');

      // Validate and de-duplicate before touching state.  The local map also
      // detects conflicting uses of an id within a single batch.
      const incoming = new Map();
      for (const event of batch) {
        if (!isValidEvent(event)) throw new Error('invalid event');
        if (!balances.has(event.account)) throw new Error('unknown account');

        const known = events.get(event.id);
        if (known !== undefined && !hasSamePayload(known, event)) {
          throw new Error('event id collision');
        }

        const prior = incoming.get(event.id);
        if (prior !== undefined && !hasSamePayload(prior, event)) {
          throw new Error('event id collision');
        }
        if (known === undefined && prior === undefined) incoming.set(event.id, event);
      }

      const byAccount = new Map();
      for (const event of incoming.values()) {
        // Committed events are always replay no-ops, regardless of their
        // position relative to the account's current version.
        if (events.has(event.id)) continue;
        if (!byAccount.has(event.account)) byAccount.set(event.account, []);
        byAccount.get(event.account).push(event);
      }

      const nextBalances = new Map(balances);
      const nextVersions = new Map(versions);
      const committed = [];

      for (const account of [...byAccount.keys()].sort()) {
        const accountEvents = byAccount.get(account);
        accountEvents.sort((a, b) => a.version - b.version || a.id.localeCompare(b.id));

        let balance = nextBalances.get(account);
        let version = nextVersions.get(account);
        for (const event of accountEvents) {
          if (event.version <= version) continue;
          if (event.version !== version + 1) throw new Error('version gap');

          balance += event.delta;
          if (balance < 0) throw new Error('negative balance');
          version = event.version;
          committed.push(event);
        }
        nextBalances.set(account, balance);
        nextVersions.set(account, version);
      }

      // This is the sole mutation point, making every earlier failure atomic.
      for (const [account, balance] of nextBalances) balances.set(account, balance);
      for (const [account, version] of nextVersions) versions.set(account, version);
      for (const event of committed) events.set(event.id, event);
      return committed.map((event) => event.id);
    },
    balance(account) { return balances.get(account); },
    version(account) { return versions.get(account); },
    event(id) { return events.get(id); },
  };
}
