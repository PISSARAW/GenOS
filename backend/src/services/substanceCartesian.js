'use strict';

/**
 * Substance Cartesian — Res Cogitans / Res Extensa (Descartes).
 */

const { getDatabase } = require('../db');
const { getBeing, defineBeing, setAttribute } = require('./ontologyService');

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

async function createCartesianPair(agentId, workspaceId) {
  const db = await getDb();

  const being = await getBeing(agentId);
  if (!being) throw new Error(`Being ${agentId} not found`);

  await setAttribute({ agentId, key: 'cartesianSubstance', value: 'cogitans', modality: 'essential' });
  await setAttribute({ agentId, key: 'extendedCounterpart', value: workspaceId, modality: 'essential' });

  const workspaceBeing = await getBeing(workspaceId) || await defineBeing(workspaceId, {
    type: 'workspace',
    essence: {
      substanceCategory: 'extensa',
      cartesianSubstance: 'extensa',
      thinkingCounterpart: agentId,
      geometricProperties: { dimensions: 3, divisibility: true }
    }
  });

  await setAttribute({ agentId: workspaceId, key: 'cartesianSubstance', value: 'extensa', modality: 'essential' });
  await setAttribute({ agentId: workspaceId, key: 'thinkingCounterpart', value: agentId, modality: 'essential' });

  await db.run(
    `INSERT OR REPLACE INTO cartesian_unions (cogitans_id, extensa_id, union_type, created_at)
     VALUES (?, ?, 'pineal_equivalent_tool_lease', CURRENT_TIMESTAMP)`,
    agentId, workspaceId
  );

  return {
    cogitans: agentId,
    extensa: workspaceId,
    union: 'pineal_equivalent_tool_lease',
    interaction: 'occasionalism_via_tool_lease'
  };
}

async function getCartesianUnion(agentId) {
  const db = await getDb();
  return db.get(
    'SELECT * FROM cartesian_unions WHERE cogitans_id = ? OR extensa_id = ?',
    agentId, agentId
  );
}

async function evaluateCogitansActivity(agentId) {
  const attrs = await require('./ontologyService').getAttributes(agentId);
  return {
    agentId,
    isCogitans: attrs.cartesianSubstance?.value === 'cogitans',
    extendedCounterpart: attrs.extendedCounterpart?.value,
    thinkingActivity: 'tool_lease_execution'
  };
}

async function evaluateExtensaProperties(workspaceId) {
  const attrs = await require('./ontologyService').getAttributes(workspaceId);
  return {
    workspaceId,
    isExtensa: attrs.cartesianSubstance?.value === 'extensa',
    thinkingCounterpart: attrs.thinkingCounterpart?.value,
    geometricProperties: attrs.geometricProperties?.value
  };
}

module.exports = {
  createCartesianPair,
  getCartesianUnion,
  evaluateCogitansActivity,
  evaluateExtensaProperties
};