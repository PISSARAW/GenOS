function sameEvent(left, right) {
  return left.id === right.id
    && left.account === right.account
    && Object.is(left.delta, right.delta)
    && left.version === right.version;
}

function normalizeEvent(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    throw new Error('invalid event');
  }

  const { id, account, delta, version } = event;
  if (typeof id !== 'string' || id.length === 0
    || typeof account !== 'string'
    || !Number.isFinite(delta)
    || !Number.isSafeInteger(version)
    || version <= 0) {
    throw new Error('invalid event');
  }

  return Object.freeze({ id, account, delta, version });
}

export function createLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const versions = new Map([...balances.keys()].map((account) => [account, 0]));
  const events = new Map();

  return {
    applyBatch(batch) {
      if (!Array.isArray(batch)) throw new Error('invalid batch');

      const pendingById = new Map();
      for (const rawEvent of batch) {
        const event = normalizeEvent(rawEvent);
        const committed = events.get(event.id);
        const pending = pendingById.get(event.id);

        if (committed && !sameEvent(committed, event)) throw new Error('event id collision');
        if (pending && !sameEvent(pending, event)) throw new Error('event id collision');
        if (committed || pending) continue;
        if (!balances.has(event.account)) throw new Error('unknown account');

        pendingById.set(event.id, event);
      }

      const stagedBalances = new Map(balances);
      const stagedVersions = new Map(versions);
      const pendingByAccount = new Map();
      for (const event of pendingById.values()) {
        if (event.version <= versions.get(event.account)) continue;
        const accountEvents = pendingByAccount.get(event.account) ?? [];
        accountEvents.push(event);
        pendingByAccount.set(event.account, accountEvents);
      }

      const accepted = [];
      for (const account of [...pendingByAccount.keys()].sort()) {
        const accountEvents = pendingByAccount.get(account);
        accountEvents.sort((left, right) => left.version - right.version || left.id.localeCompare(right.id));

        for (const event of accountEvents) {
          const currentVersion = stagedVersions.get(account);
          if (event.version !== currentVersion + 1) throw new Error('version gap');

          const nextBalance = stagedBalances.get(account) + event.delta;
          if (nextBalance < 0) throw new Error('negative balance');

          stagedBalances.set(account, nextBalance);
          stagedVersions.set(account, event.version);
          accepted.push(event);
        }
      }

      for (const [account, balance] of stagedBalances) balances.set(account, balance);
      for (const [account, version] of stagedVersions) versions.set(account, version);
      for (const event of accepted) events.set(event.id, event);
      return accepted.map((event) => event.id);
    },
    balance(account) { return balances.get(account); },
    version(account) { return versions.get(account); },
    event(id) { return events.get(id); },
  };
}
