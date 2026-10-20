'use strict';

const { digest } = require('../../evidenceContractService');

const COLLECTIONS = Object.freeze([
  ['patches', 'metapopulation_patches', 'patch_id'],
  ['demes', 'metapopulation_demes', 'deme_id'],
  ['corridors', 'metapopulation_corridors', 'corridor_id'],
  ['migrations', 'metapopulation_migrations', 'migration_id'],
  ['colonizations', 'metapopulation_colonizations', 'colonization_id'],
  ['fitness', 'mission_fitness', 'fitness_id'],
  ['events', 'metapopulation_events', 'sequence']
]);

async function rows(db, collection, metapopulationId) {
  return db.all(`SELECT * FROM ${collection[1]}
    WHERE metapopulation_id = ? ORDER BY ${collection[2]}`, metapopulationId);
}

async function capture(db, metapopulationId) {
  const session = await db.get(
    'SELECT * FROM metapopulation_sessions WHERE id = ?', metapopulationId);
  if (!session) throw stateError('METAPOPULATION_SESSION_UNKNOWN',
    'Unknown metapopulation session.');
  const values = await Promise.all(COLLECTIONS.map((entry) =>
    rows(db, entry, metapopulationId)));
  const state = { session };
  COLLECTIONS.forEach((entry, index) => { state[entry[0]] = values[index]; });
  return { revision: Number(session.revision), hash: digest(state) };
}

async function assertUnchanged(db, metapopulationId, expected) {
  const actual = await capture(db, metapopulationId);
  if (actual.revision !== expected.revision || actual.hash !== expected.hash) {
    throw stateError('REGIONAL_STATE_CHANGED_DURING_VERIFICATION',
      'Canonical regional state changed between verification and persistence.');
  }
  return actual;
}

function stateError(code, message) {
  return Object.assign(new Error(message), { code });
}

module.exports = { capture, assertUnchanged };
