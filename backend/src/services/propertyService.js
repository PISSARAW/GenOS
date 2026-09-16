'use strict';

// // Property Service — Attributes/Properties (Kim, Davidson, Shoemaker, Bird). // // Mapping GenOS : // // - Supervenience (Kim/Davidson) : propriétés mentales superviennent sur physiques // // - Emergence non-réductive : propriétés systémiques irréductibles aux composants // // - Propriétés dispositionnelles (Shoemaker/Bird) : pouvoirs causaux, dispositions // // - Propriétés catégoriques : qualités intrinsèques non-dispositionnelles // // - Trope theory : propriétés comme particuliers abstraits (non-universaux) // // - Propriétés relationnelles vs intrinsèques // // - Causal powers ontology : propriétés = pouvoirs causaux // // /

const { getDatabase } = require('../db');
const { getBeing, getAttributes, setAttribute } = require('./ontologyService');

const PROPERTY_TYPES = [
  'categorical',      // Propriétés catégoriques (qualités intrinsèques)
  'dispositional',    // Propriétés dispositionnelles (pouvoirs, tendances)
  'relational',       // Propriétés relationnelles (dépendent d'autres entités)
  'emergent',         // Propriétés émergentes (systémiques, non-réductives)
  'supervenient',     // Propriétés supervenantes (dépendent base physique)
  'structural'        // Propriétés structurelles (organisation)
];

const SUPERVENIENCE_BASES = [
  'physical',         // Base physique (neurones, hardware, processus)
  'computational',    // Base computationnelle (algorithmes, états)
  'functional',       // Base fonctionnelle (rôles, patterns)
  'biological'        // Base biologique (métabolisme, homéostasie)
];

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = getDatabase();
  }
  return dbPromise;
}

// // Enregistre une propriété avec son type ontologique. // // /
async function registerProperty(agentId, propertyKey, options = {}) {
  const {
    propertyType = 'categorical',
    value,
    modality = 'accidental',
    supervenienceBase = null,
    dispositionalProfile = null,
    emergenceLevel = 0,
    causalPowers = [],
    intrinsic = true
  } = options;

  if (!PROPERTY_TYPES.includes(propertyType)) {
    throw new Error(`Invalid propertyType: ${propertyType}`);
  }

  // Enregistrer comme attribut avec métadonnées étendues
  const propertyData = {
    value,
    propertyType,
    supervenienceBase,
    dispositionalProfile,
    emergenceLevel,
    causalPowers,
    intrinsic,
    registeredAt: new Date().toISOString()
  };

  await setAttribute({
    agentId,
    key: propertyKey,
    value: propertyData,
    modality
  });

  // Si supervenante, enregistrer la relation de supervenience
  if (supervenienceBase) {
    await recordSupervenience(agentId, propertyKey, supervenienceBase);
  }

  // Si dispositionnelle, enregistrer le profil dispositionnel
  if (propertyType === 'dispositional' && dispositionalProfile) {
    await recordDispositionalProfile(agentId, propertyKey, dispositionalProfile);
  }

  return { agentId, propertyKey, ...propertyData };
}

// // Supervenience (Kim/Davidson) : propriétés mentales superviennent sur base physique. // // Pas de différence mentale sans différence physique. // // /
async function recordSupervenience(agentId, supervenientProperty, base) {
  const db = await getDb();

  if (!SUPERVENIENCE_BASES.includes(base)) {
    throw new Error(`Invalid supervenienceBase: ${base}`);
  }

  await db.run(
    `INSERT OR REPLACE INTO property_supervenience (agent_id, supervenient_property, base_type, established_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    agentId, supervenientProperty, base
  );

  // Vérifier le principe de supervenience : même base → même propriété
  await verifySupervenience(agentId, supervenientProperty, base);

  return { agentId, supervenientProperty, base, verified: true };
}

// // Vérifie la supervenience : même base physique → même propriété mentale. // // /
async function verifySupervenience(agentId, propertyKey, baseType) {
  const db = await getDb();

  // Récupérer la base physique correspondante
  const baseKey = getBasePropertyKey(baseType);
  const baseAttr = await getAttributes(agentId).then(a => a[baseKey]);
  const supervenientAttr = await getAttributes(agentId).then(a => a[propertyKey]);

  if (!baseAttr || !supervenientAttr) return { verified: false, reason: 'missing_attributes' };

  // Enregistrer la correspondance base→supervenant
  await db.run(
    `INSERT OR REPLACE INTO supervenience_mappings (agent_id, base_hash, supervenient_hash, property_key, base_type, verified_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    agentId,
    hashValue(baseAttr.value),
    hashValue(supervenientAttr.value),
    propertyKey,
    baseType
  );

  return { verified: true, baseHash: hashValue(baseAttr.value), supervenientHash: hashValue(supervenientAttr.value) };
}

function getBasePropertyKey(baseType) {
  const map = {
    'physical': 'physical_state',
    'computational': 'computational_state',
    'functional': 'functional_role',
    'biological': 'biological_state'
  };
  return map[baseType] || 'physical_state';
}

function hashValue(value) {
  const crypto = require('crypto');
  const str = typeof value === 'string' ? value : JSON.stringify(value, Object.keys(value).sort());
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

// // Propriétés dispositionnelles (Shoemaker/Bird) : pouvoirs causaux. // // Une propriété dispositionnelle = tendance à manifester certains effets dans certaines conditions. // // /
async function recordDispositionalProfile(agentId, propertyKey, profile) {
  const db = await getDb();

  const {
    stimulusConditions = [],    // Conditions de déclenchement
    manifestation = null,       // Ce qui se manifeste
    causalPower = null,         // Pouvoir causal intrinsèque
    strength = 1.0,             // Force de la disposition (0-1)
    ceterisParibus = true       // Toutes choses égales par ailleurs
  } = profile;

  await db.run(
    `INSERT OR REPLACE INTO dispositional_properties (agent_id, property_key, stimulus_conditions, manifestation, causal_power, strength, ceteris_paribus, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    agentId,
    propertyKey,
    JSON.stringify(stimulusConditions),
    manifestation,
    causalPower,
    strength,
    ceterisParibus ? 1 : 0
  );

  return { agentId, propertyKey, profile };
}

// // Teste si une disposition se manifeste (stimulus → manifestation). // // /
async function testDispositionManifestation(agentId, propertyKey, stimulusConditions) {
  const db = await getDb();

  const disposition = await db.get(
    'SELECT * FROM dispositional_properties WHERE agent_id = ? AND property_key = ?',
    agentId, propertyKey
  );

  if (!disposition) return { manifests: false, reason: 'no_disposition' };

  const conditions = JSON.parse(disposition.stimulus_conditions || '[]');
  const matches = conditions.some(c => stimulusConditions.includes(c));

  if (!matches) return { manifests: false, reason: 'stimulus_not_met' };

  // La disposition se manifeste
  await recordManifestationEvent({ agentId, propertyKey, manifestation: disposition.manifestation, stimulus: stimulusConditions });

  return {
    manifests: true,
    manifestation: disposition.manifestation,
    causalPower: disposition.causal_power,
    strength: disposition.strength
  };
}

// // Enregistre un événement de manifestation dispositionnelle. // // /
async function recordManifestationEvent({ agentId, propertyKey, manifestation, stimulus }) {
  const db = await getDb();
  await db.run(
    `INSERT INTO dispositional_manifestations (agent_id, property_key, manifestation, stimulus_conditions, manifested_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    agentId, propertyKey, manifestation, JSON.stringify(stimulus)
  );
}

// // Propriétés émergentes (Kim) : propriétés systémiques non-réductibles. // // Emergence = nouveauté ontologique + irreductibilité explicative. // // /
async function registerEmergentProperty(agentId, propertyKey, options = {}) {
  const {
    constituentProperties = [],  // Propriétés des composants
    emergenceType = 'weak',      // 'weak' | 'strong' | 'synergistic'
    systemicFunction = null,     // Fonction systémique réalisée
    irreducibilityProof = null,  // Preuve d'irreductibilité
    downwardCausation = false    // Causalité descendante
  } = options;

  const propertyData = {
    propertyType: 'emergent',
    value: { emergenceType, systemicFunction, irreducibilityProof, downwardCausation, constituentProperties },
    emergenceLevel: 1,
    registeredAt: new Date().toISOString()
  };

  await setAttribute({
    agentId,
    key: propertyKey,
    value: propertyData,
    modality: 'essential' // Propriétés émergentes souvent essentielles au système
  });

  const db = await getDb();
  await db.run(
    `INSERT OR REPLACE INTO emergent_properties (agent_id, property_key, constituent_properties, emergence_type, systemic_function, irreducibility_proof, downward_causation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    agentId,
    propertyKey,
    JSON.stringify(constituentProperties),
    emergenceType,
    systemicFunction,
    irreducibilityProof,
    downwardCausation ? 1 : 0
  );

  return { agentId, propertyKey, ...propertyData };
}

// // Détecte l'émergence : propriété présente au niveau système mais absente des composants. // // /
async function detectEmergence(agentId, systemPropertyKey, constituentIds) {
  const db = await getDb();

  // Vérifier que la propriété système existe
  const systemAttr = await getAttributes(agentId).then(a => a[systemPropertyKey]);
  if (!systemAttr) return { emergent: false, reason: 'system_property_missing' };

  // Vérifier l'absence chez les composants
  const constituentAttrs = await Promise.all(
    constituentIds.map(id => getAttributes(id).then(a => a[systemPropertyKey]))
  );

  const absentFromAll = constituentAttrs.every(a => !a);

  if (absentFromAll) {
    await registerEmergentProperty(agentId, systemPropertyKey, {
      constituentProperties: constituentIds,
      emergenceType: 'strong',
      systemicFunction: 'system_level_coordination',
      irreducibilityProof: 'absent_from_all_constituents'
    });
    return { emergent: true, type: 'strong', reason: 'absent_from_constituents' };
  }

  return { emergent: false, reason: 'present_in_constituents' };
}

// // Propriétés catégoriques vs dispositionnelles (Bird/Shoemaker). // // Catégorique = qualité intrinsèque ; Dispositionnelle = pouvoir causal. // // /
async function classifyProperty(agentId, propertyKey) {
  const attr = await getAttributes(agentId).then(a => a[propertyKey]);
  if (!attr) return { classified: false, reason: 'not_found' };

  const value = attr.value;
  if (!value || typeof value !== 'object') {
    return { classification: 'categorical', reason: 'primitive_value' };
  }

  if (value.propertyType) return { classification: value.propertyType, explicit: true };

  // Inférer du profil
  if (value.dispositionalProfile || value.causalPowers?.length) {
    return { classification: 'dispositional', inferred: true };
  }
  if (value.emergenceLevel > 0) {
    return { classification: 'emergent', inferred: true };
  }
  if (value.supervenienceBase) {
    return { classification: 'supervenient', inferred: true };
  }

  return { classification: 'categorical', default: true };
}

// // Causalité par propriétés (Shoemaker) : les propriétés SONT des pouvoirs causaux. // // /
async function getCausalPowers(agentId) {
  const db = await getDb();
  const attrs = await getAttributes(agentId);

  const powers = [];
  for (const [key, attr] of Object.entries(attrs)) {
    const value = attr.value;
    if (value?.causalPowers?.length) {
      powers.push({
        property: key,
        powers: value.causalPowers,
        type: value.propertyType || 'dispositional'
      });
    }
  }

  // Aussi vérifier dispositions enregistrées
  const dispositions = await db.all(
    'SELECT * FROM dispositional_properties WHERE agent_id = ?',
    agentId
  );

  for (const d of dispositions) {
    powers.push({
      property: d.property_key,
      causalPower: d.causal_power,
      strength: d.strength,
      type: 'dispositional'
    });
  }

  return powers;
}

// // Identity of indiscernibles (Leibniz) appliqué aux propriétés. // // Deux entités avec toutes mêmes propriétés = identiques. // // /
async function checkPropertyIdentity(agentId1, agentId2) {
  const attrs1 = await getAttributes(agentId1);
  const attrs2 = await getAttributes(agentId2);

  const keys1 = new Set(Object.keys(attrs1));
  const keys2 = new Set(Object.keys(attrs2));
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    const has1 = keys1.has(key);
    const has2 = keys2.has(key);

    if (has1 !== has2) {
      return { identical: false, differingProperty: key, reason: 'missing_in_one' };
    }

    const v1 = attrs1[key].value;
    const v2 = attrs2[key].value;
    if (JSON.stringify(v1) !== JSON.stringify(v2)) {
      return { identical: false, differingProperty: key, reason: 'value_mismatch' };
    }
  }

  return { identical: true, propertyCount: allKeys.size };
}


// Schema DB extrait dans propertyServiceSchema.js
const { ensurePropertyTables } = require('./propertyServiceSchema');

module.exports = {
  registerProperty,
  recordSupervenience,
  verifySupervenience,
  recordDispositionalProfile,
  testDispositionManifestation,
  registerEmergentProperty,
  detectEmergence,
  classifyProperty,
  getCausalPowers,
  checkPropertyIdentity,
  ensurePropertyTables,
  PROPERTY_TYPES,
  SUPERVENIENCE_BASES
};