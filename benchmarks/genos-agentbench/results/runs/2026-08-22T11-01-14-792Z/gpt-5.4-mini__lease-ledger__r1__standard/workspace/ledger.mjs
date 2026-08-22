function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function sameEvent(a, b) {
  return a.id === b.id && a.account === b.account && a.delta === b.delta && a.version === b.version;
}

function validateEvent(event) {
  if (event === null || typeof event !== 'object') {
    throw new Error('invalid event');
  }

  const { id, account, delta, version } = event;

  if (typeof id !== 'string' || id.length === 0) {
    throw new Error('invalid event');
  }
  if (typeof account !== 'string' || account.length === 0) {
    throw new Error('invalid event');
  }
  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new Error('invalid event');
  }
  if (!isPositiveInteger(version)) {
    throw new Error('invalid event');
  }

  return { id, account, delta, version };
}

function replaceMapContents(target, source) {
  target.clear();
  for (const [key, value] of source) {
    target.set(key, value);
  }
}

export function createLedger(openingBalances = {}) {
  const balances = new Map(Object.entries(openingBalances));
  const versions = new Map([...balances.keys()].map((account) => [account, 0]));
  const events = new Map();

  return {
    applyBatch(batch) {
      const items = Array.from(batch);
      const pendingById = new Map();
      const pendingByAccount = new Map();

      for (const rawEvent of items) {
        const event = validateEvent(rawEvent);

        if (!balances.has(event.account)) {
          throw new Error('unknown account');
        }

        const committed = events.get(event.id);
        if (committed) {
          if (!sameEvent(committed, event)) {
            throw new Error('id collision');
          }
          continue;
        }

        const staged = pendingById.get(event.id);
        if (staged) {
          if (!sameEvent(staged, event)) {
            throw new Error('id collision');
          }
          continue;
        }

        if (event.version <= versions.get(event.account)) {
          continue;
        }

        pendingById.set(event.id, event);

        const accountEvents = pendingByAccount.get(event.account);
        if (accountEvents) {
          accountEvents.push(event);
        } else {
          pendingByAccount.set(event.account, [event]);
        }
      }

      const nextBalances = new Map(balances);
      const nextVersions = new Map(versions);
      const nextEvents = new Map(events);
      const accepted = [];

      const accounts = [...pendingByAccount.keys()].sort();
      for (const account of accounts) {
        const accountEvents = pendingByAccount.get(account).slice().sort((a, b) => {
          if (a.version !== b.version) return a.version - b.version;
          return a.id.localeCompare(b.id);
        });

        let currentVersion = nextVersions.get(account);
        let currentBalance = nextBalances.get(account);

        for (const event of accountEvents) {
          if (event.version !== currentVersion + 1) {
            throw new Error('skips version');
          }

          const nextBalance = currentBalance + event.delta;
          if (nextBalance < 0) {
            throw new Error('negative balance');
          }

          currentVersion = event.version;
          currentBalance = nextBalance;
          nextVersions.set(account, currentVersion);
          nextBalances.set(account, currentBalance);
          nextEvents.set(event.id, { ...event });
          accepted.push(event.id);
        }
      }

      replaceMapContents(balances, nextBalances);
      replaceMapContents(versions, nextVersions);
      replaceMapContents(events, nextEvents);

      return accepted;
    },
    balance(account) { return balances.get(account); },
    version(account) { return versions.get(account); },
    event(id) { return events.get(id); },
  };
}
