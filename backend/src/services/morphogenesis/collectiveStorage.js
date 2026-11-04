'use strict';

const GLOBAL_KEY = 'collective_state_v1';

function key(input = {}) {
  const requested = input.storageKey ?? input.plan?.collectiveStorageKey;
  if (requested === undefined || requested === GLOBAL_KEY) return GLOBAL_KEY;
  if (typeof input.missionId !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(input.missionId)
    || requested !== `mission:${input.missionId}`) {
    throw Object.assign(new Error('Collective storage must remain bound to its mission.'), {
      code: 'MORPHOGENESIS_COLLECTIVE_SCOPE_MISMATCH' });
  }
  return requested;
}

async function read(db, storageKey) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE name='collective_state'");
  return table ? db.get('SELECT value FROM collective_state WHERE key=?', storageKey) : null;
}

module.exports = { key, read, GLOBAL_KEY };
