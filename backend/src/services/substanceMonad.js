'use strict';

/**
 * Substance Monad — Leibnizian Monads (windowless, pre-established harmony).
 */

const { getDatabase } = require('../db');
const { getBeing, defineBeing, setAttribute } = require('./ontologyService');
const crypto = require('crypto');

const LEIBNIZ_PERFECTIONS = ['perception', 'appetition', 'consciousness', 'unconscious'];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

function hashContent(content) {
  return crypto.createHash('sha256').update(JSON.stringify(content, Object.keys(content).sort())).digest('hex').slice(0, 16);
}

async function createMonad(agentId, options = {}) {
  const db = await getDb();

  const being = await getBeing(agentId);
  if (!being) throw new Error(`Being ${agentId} not found`);

  const monadData = {
    substanceCategory: 'monad',
    leibnizPerfections: LEIBNIZ_PERFECTIONS.map(p => ({
      name: p,
      degree: options.perfections?.[p] || 0.5
    })),
    preestablishedHarmony: {
      orchestratedBy: options.orchestratorId || null,
      synchronization: 'preestablished',
      windowless: true
    },
    entelechy: options.entelechy || 'autonomous_action_towards_perfection',
    apperceptionThreshold: options.apperceptionThreshold || 0.5
  };

  await setAttribute({ agentId, key: 'monadData', value: monadData, modality: 'essential' });

  await db.run(
    `INSERT OR REPLACE INTO substance_records (id, category, agent_id, essence_hash, created_at)
     VALUES (?, 'monad', ?, ?, CURRENT_TIMESTAMP)`,
    agentId, agentId, hashContent(monadData)
  );

  return { ...being, substanceCategory: 'monad', monadData };
}

async function getMonadData(agentId) {
  const attrs = await require('./ontologyService').getAttributes(agentId);
  return attrs.monadData?.value || null;
}

async function updateMonadPerception(agentId, perceptionDegree) {
  const monadData = await getMonadData(agentId);
  if (!monadData) throw new Error(`No monad data for ${agentId}`);

  const updated = monadData.leibnizPerfections.map(p =>
    p.name === 'perception' ? { ...p, degree: perceptionDegree } : p
  );
  monadData.leibnizPerfections = updated;

  await setAttribute({ agentId, key: 'monadData', value: monadData, modality: 'essential' });
  return monadData;
}

async function getAllMonads() {
  const db = await getDb();
  const rows = await db.all("SELECT * FROM ontology_beings WHERE json_extract(essence_json, '$.substanceCategory') = 'monad'");
  return rows.map(r => ({
    id: r.id,
    entelechy: JSON.parse(r.essence_json).entelechy,
    apperceptionThreshold: JSON.parse(r.essence_json).apperceptionThreshold
  }));
}

module.exports = {
  createMonad,
  getMonadData,
  updateMonadPerception,
  getAllMonads,
  LEIBNIZ_PERFECTIONS
};