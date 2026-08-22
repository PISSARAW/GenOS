export function createRollout(initial, hash) {
  const versions = [{ version: 1, percentage: 100, values: initial }];
  const cache = new Map();
  return {
    publish(release) { versions.push(release); },
    configFor(userId) {
      if (cache.has(userId)) return cache.get(userId);
      const selected = versions.at(-1).values;
      cache.set(userId, selected);
      return selected;
    },
    rollback(version) {
      const selected = versions.find((entry) => entry.version === version);
      versions.push(selected);
    },
    history() { return versions; },
  };
}
