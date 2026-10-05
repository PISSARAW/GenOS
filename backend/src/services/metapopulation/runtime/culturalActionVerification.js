'use strict';

const migrationStore = require('../migration/migrationStore');
const cultures = require('../migration/culturalPersistentRuntimeService');

async function verifyCulturalActions(context) {
  const { actions, results, db, metapopulationId } = context;
  for (const action of actions) {
    if (!CULTURAL_TYPES.has(action.type)) continue;
    const result = results.find((entry) => matches(action, entry));
    if (!result || !await verifyOne({ action, result, db, metapopulationId })) return false;
  }
  return true;
}

const CULTURAL_TYPES = new Set(['TRANSFER_CULTURE', 'REJECT_CULTURE_TRANSFER',
  'MUTATE_CULTURE', 'BUILD_CULTURAL_PHYLOGENY']);

function matches(action, result) {
  if (action.type !== result.type) return false;
  if (action.type === 'TRANSFER_CULTURE') return action.culture?.id === result.cultureId;
  if (action.type === 'REJECT_CULTURE_TRANSFER') return action.cultureId === result.cultureId;
  if (action.type === 'MUTATE_CULTURE') return action.cultureId === result.requestedCultureId;
  return true;
}

async function verifyOne(context) {
  const { action, result } = context;
  if (action.type === 'REJECT_CULTURE_TRANSFER') {
    return result.rejected === true && result.reason === action.reason;
  }
  if (action.type === 'TRANSFER_CULTURE') return verifyTransfer(context);
  if (action.type === 'MUTATE_CULTURE') return verifyMutation(context);
  return verifyPhylogeny(context);
}

async function verifyTransfer(context) {
  const { action, result, db, metapopulationId } = context;
  if (!result.offered || !result.migrationId) return false;
  const culture = await cultures.getCulture({ db, metapopulationId, cultureId: result.cultureId });
  const migration = await migrationStore.getMigration(db, metapopulationId, result.migrationId);
  return culture?.version === action.culture.version && migration?.payloadRef === action.culture.id
    && migration.sourceDemeId === action.sourceDemeId
    && migration.targetDemeId === action.targetDemeId
    && ['QUARANTINED', 'ACCEPTED', 'REJECTED'].includes(migration.status);
}

async function verifyMutation(context) {
  const { action, result, db, metapopulationId } = context;
  if (!result.mutated) return false;
  const child = await cultures.getCulture({ db, metapopulationId, cultureId: result.cultureId });
  return child?.parentCultureId === action.cultureId && child.version === result.newVersion
    && child.contentHash === result.contentHash;
}

async function verifyPhylogeny(context) {
  const { result, db, metapopulationId } = context;
  const persisted = await cultures.buildCulturalPhylogeny({ db, metapopulationId });
  return result.count === persisted.count && JSON.stringify(result.nodes) === JSON.stringify(persisted.nodes);
}

module.exports = { verifyCulturalActions };
