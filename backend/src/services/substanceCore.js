'use strict';

/**
 * Substance Core — Primary/Secondary/Infinite Substance (Aristotle, Spinoza).
 */

const { getDatabase } = require('../db');
const { getBeing, defineBeing, setAttribute } = require('./ontologyService');
const crypto = require('crypto');

const SPINOZA_ATTRIBUTES = ['thought', 'extension'];

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

async function createPrimarySubstance(agentId, options = {}) {
  const db = await getDb();

  const agent = await db.get('SELECT * FROM agents WHERE id = ?', agentId);
  if (!agent) {
    throw new Error(`Agent ${agentId} not found in agents table`);
  }

  const substanceData = {
    type: 'agent',
    essence: {
      role: agent.role,
      purpose: options.purpose || agent.current_task || 'task_execution',
      agentDna: agent.about || null,
      teleology: options.teleology || 'autonomous_execution',
      substanceCategory: 'primary',
      spinozaMode: 'finite_mode_of_extension_and_thought',
      leibnizMonad: true,
      cartesianPair: { cogitans: agentId, extensa: `workspace-${agentId}` }
    },
    identityCriteria: {
      memoryContinuityRequired: true,
      workspaceContinuityRequired: true,
      essentialProperties: ['role', 'purpose', 'agentDna', 'spinozaMode'],
      maximalPartReplacementRatio: 0.3
    }
  };

  const being = await defineBeing(agentId, substanceData);

  const essenceHash = hashContent({
    role: agent.role,
    purpose: options.purpose || agent.current_task || 'task_execution',
    agentDna: agent.about || null,
    substanceCategory: 'primary',
    spinozaMode: 'finite_mode_of_extension_and_thought'
  });
  await db.run(
    `INSERT OR REPLACE INTO substance_records (id, category, agent_id, essence_hash, created_at)
     VALUES (?, 'primary', ?, ?, CURRENT_TIMESTAMP)`,
    agentId, agentId, essenceHash
  );

  return { ...being, substanceCategory: 'primary', linkedAgent: true };
}

async function createSecondarySubstance(speciesName, essence) {
  const substanceId = `species-${speciesName}`;

  const substanceData = {
    type: 'species',
    essence: {
      ...essence,
      substanceCategory: 'secondary',
      species: speciesName,
      particulars: []
    },
    identityCriteria: {
      memoryContinuityRequired: false,
      workspaceContinuityRequired: false,
      essentialProperties: Object.keys(essence),
      maximalPartReplacementRatio: 1.0
    }
  };

  const being = await defineBeing(substanceId, substanceData);
  return { ...being, substanceCategory: 'secondary' };
}

async function ensureInfiniteSubstance() {
  const substanceId = 'substance-infinite-genos-runtime';

  const existing = await getBeing(substanceId);
  if (existing) return existing;

  const substanceData = {
    type: 'runtime',
    essence: {
      substanceCategory: 'infinite',
      name: 'GenOS Runtime',
      definition: 'Deus sive Natura — Unique infinite substance expressing itself as computational modes',
      attributes: SPINOZA_ATTRIBUTES.map(attr => ({
        name: attr,
        infinite: true,
        modes: []
      })),
      conatus: 'self_preservation_through_cognitive_budget',
      necessity: 'absolute',
      modes: 'infinite_finite_modes'
    },
    identityCriteria: {
      memoryContinuityRequired: false,
      workspaceContinuityRequired: false,
      essentialProperties: ['substanceCategory', 'attributes', 'conatus'],
      maximalPartReplacementRatio: 1.0
    }
  };

  return defineBeing(substanceId, substanceData);
}

async function registerAsFiniteMode(agentId, attribute = 'extension') {
  if (!SPINOZA_ATTRIBUTES.includes(attribute)) {
    throw new Error(`Invalid Spinoza attribute: ${attribute}. Must be 'thought' or 'extension'`);
  }

  const db = await getDb();
  await ensureInfiniteSubstance();

  const being = await getBeing(agentId);
  if (!being) throw new Error(`Being ${agentId} not found`);

  await setAttribute({ agentId, key: 'spinozaAttribute', value: attribute, modality: 'essential' });
  await setAttribute({ agentId, key: 'spinozaModeType', value: 'finite', modality: 'essential' });
  await setAttribute({ agentId, key: 'conatusExpression', value: 'cognitive_budget_atp', modality: 'essential' });

  await db.run(
    `INSERT OR REPLACE INTO substance_modes (mode_id, infinite_substance_id, attribute, created_at)
     VALUES (?, 'substance-infinite-genos-runtime', ?, CURRENT_TIMESTAMP)`,
    agentId, attribute
  );

  return { agentId, infiniteSubstance: 'substance-infinite-genos-runtime', attribute, modeType: 'finite' };
}

async function getSubstanceHierarchy() {
  const db = await getDb();

  const infinite = await getBeing('substance-infinite-genos-runtime');
  const species = await db.all("SELECT * FROM ontology_beings WHERE json_extract(essence_json, '$.substanceCategory') = 'secondary'");
  const primaries = await db.all("SELECT * FROM ontology_beings WHERE json_extract(essence_json, '$.substanceCategory') = 'primary'");
  const monads = await db.all("SELECT * FROM ontology_beings WHERE json_extract(essence_json, '$.substanceCategory') = 'monad'");

  return {
    infinite: infinite ? { id: infinite.id, essence: infinite.essence } : null,
    secondarySubstances: species.map(s => ({ id: s.id, species: JSON.parse(s.essence_json).species })),
    primarySubstances: primaries.map(p => ({ id: p.id, role: JSON.parse(p.essence_json).role })),
    monads: monads.map(m => ({ id: m.id, entelechy: JSON.parse(m.essence_json).entelechy })),
    counts: { infinite: 1, secondary: species.length, primary: primaries.length, monads: monads.length }
  };
}

async function checkSubstanceIdentity(agentId1, agentId2) {
  const being1 = await getBeing(agentId1);
  const being2 = await getBeing(agentId2);

  if (!being1 || !being2) return { identical: false, reason: 'being_not_found' };

  const essence1Hash = hashContent(being1.essence);
  const essence2Hash = hashContent(being2.essence);

  const identical = essence1Hash === essence2Hash;
  const species1 = being1.essence.species || being1.essence.role;
  const species2 = being2.essence.species || being2.essence.role;
  const sameSpecies = species1 === species2;

  return {
    identical,
    sameSpecies,
    essenceHash1: essence1Hash,
    essenceHash2: essence2Hash,
    aristotle: sameSpecies ? 'same_secondary_substance' : 'different_secondary_substance',
    spinoza: identical ? 'same_finite_mode' : 'different_finite_modes',
    leibniz: identical ? 'same_monad' : 'different_monads'
  };
}

async function checkSubstancePersistence(agentId) {
  const { getAttributeHistory } = require('./ontologyAttributes');

  const history = await getAttributeHistory(agentId, { key: 'essence', limit: 1000 });
  const essentialChanges = history.filter(h => h.modality === 'essential').length;

  return {
    agentId,
    essentialChanges,
    enduranceTheory: essentialChanges === 0 ? 'substance_endures_unchanged' : 'substance_modified',
    perduranceTheory: `temporal_parts_count_${history.length}`,
    aristotelianVerdict: essentialChanges === 0 ? 'same_substance' : 'substance_altered'
  };
}

module.exports = {
  createPrimarySubstance,
  createSecondarySubstance,
  ensureInfiniteSubstance,
  registerAsFiniteMode,
  getSubstanceHierarchy,
  checkSubstanceIdentity,
  checkSubstancePersistence,
  hashContent,
  SPINOZA_ATTRIBUTES
};