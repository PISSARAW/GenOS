function upsertStdpHistory(record) {
  const { sourceId, targetId, deltaT, success } = record;
  const key = `${sourceId}::${targetId}`;
  const existing = stdpHistory.get(key);
  const updated = {
    sourceId,
    targetId,
    lastDeltaT: deltaT,
    lastSuccess: success,
    updatedAt: new Date().toISOString()
  };
  stdpHistory.set(key, updated);
  return { ...existing, ...updated };
}
