'use strict';

/**
 * Cognitive Key System — registre et validation (ADR 0033, point 1).
 *
 * Responsabilités :
 *  - normaliser chaque clé (apiVersion/kind) et la valider contre
 *    spec/cognitive-key.schema.json ;
 *  - garantir l'intégrité croisée (compatibleWith / conflictsWith
 *    référencent des clés existantes) ;
 *  - appliquer la règle d'indépendance doctrinale : label, instruction
 *    et questions ne mentionnent jamais philosophe, école ou mouvement ;
 *  - vérifier la couverture du vocabulaire d'opérations (aucune valeur
 *    de l'enum ne doit rester inutilisée — pas de vocabulaire décoratif) ;
 *  - résoudre la provenance (derivedFrom) de façon SOUPLE : les IDs de
 *    concepts évoluent indépendamment, un échec de résolution est un
 *    avertissement, jamais une invalidation.
 */

const fs = require('fs');
const path = require('path');

const { COGNITIVE_KEYS } = require('./cognitiveKeyDefinitions');
const { validateSpec } = require('../services/specValidator');

const KEY_SCHEMA = 'cognitive-key.schema.json';
const SCHEMA_PATH = path.resolve(__dirname, '../../../spec', KEY_SCHEMA);

const KEY_ID_PATTERN = /^cognitive\.[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONCEPT_REF_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

const MIN_INSTRUCTION_LENGTH = 40;
const NON_EMPTY_ARRAY_FIELDS = ['inputs', 'outputs', 'usefulWhen', 'failureModes', 'derivedFrom'];
const REFERENCE_FIELDS = ['compatibleWith', 'conflictsWith'];

const DOCTRINE_DENYLIST = [
  'kant', 'aristot', 'nietzsch', 'deleuz', 'popper', 'hume', 'lewis', 'rawls',
  'gettier', 'kuhn', 'hegel', 'marx', 'barthes', 'benjamin', 'foucault',
  'derrida', 'platon', 'plato', 'descartes', 'leibniz', 'spinoza', 'whitehead',
  'husserl', 'heidegger', 'sartre', 'badiou', 'meillassoux', 'wittgenstein',
  'frege', 'godel', 'tarski', 'kripke', 'stoic', 'cubis', 'utilitarian',
  'phenomenolog', 'structuralism', 'nominalism', 'minimalism', 'maximalism'
];

function normalizeKey(key) {
  return {
    apiVersion: 'genos.cognition/v1',
    kind: 'CognitiveKey',
    id: key.id,
    label: key.label,
    operation: key.operation,
    instruction: key.instruction,
    questions: key.questions || [],
    inputs: key.inputs,
    outputs: key.outputs,
    transform: key.transform || null,
    usefulWhen: key.usefulWhen,
    failureModes: key.failureModes,
    compatibleWith: key.compatibleWith || [],
    conflictsWith: key.conflictsWith || [],
    cost: key.cost,
    evidenceRequired: key.evidenceRequired,
    derivedFrom: key.derivedFrom,
    provenance: key.provenance || null
  };
}

function duplicateIds(keys) {
  const seen = new Set();
  const duplicates = new Set();
  keys.forEach((key) => {
    if (seen.has(key.id)) duplicates.add(key.id);
    seen.add(key.id);
  });
  return [...duplicates].sort();
}

function validateKeyFields(key, index) {
  const errors = [];
  const label = `keys[${index}]`;
  if (!KEY_ID_PATTERN.test(key.id)) {
    errors.push(`${label}.id must match the cognitive.* dash-segment pattern`);
  }
  if (typeof key.instruction !== 'string' || key.instruction.length < MIN_INSTRUCTION_LENGTH) {
    errors.push(`${label}.instruction must be at least ${MIN_INSTRUCTION_LENGTH} characters`);
  }
  NON_EMPTY_ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(key[field]) || key[field].length === 0) {
      errors.push(`${label}.${field} must be a non-empty array`);
    }
  });
  REFERENCE_FIELDS.forEach((field) => {
    const refs = key[field] || [];
    if (refs.some((ref) => !KEY_ID_PATTERN.test(ref))) {
      errors.push(`${label}.${field} contains a malformed key reference`);
    }
  });
  if (!(key.derivedFrom || []).every((ref) => CONCEPT_REF_PATTERN.test(ref))) {
    errors.push(`${label}.derivedFrom contains a malformed concept reference`);
  }
  return errors;
}

function crossReferenceErrors(keys) {
  const ids = new Set(keys.map((key) => key.id));
  const errors = [];
  keys.forEach((key) => {
    REFERENCE_FIELDS.forEach((field) => {
      (key[field] || []).forEach((ref) => {
        if (!ids.has(ref)) {
          errors.push(`${key.id}.${field} references unknown key '${ref}'`);
        }
      });
    });
  });
  return errors;
}

function doctrineViolations(key) {
  const haystack = [key.label, key.instruction, ...(key.questions || [])]
    .join(' ')
    .toLowerCase();
  return DOCTRINE_DENYLIST.filter((term) => haystack.includes(term));
}

function doctrineErrors(keys) {
  const errors = [];
  keys.forEach((key) => {
    const violations = doctrineViolations(key);
    if (violations.length) {
      errors.push(`${key.id} mentions doctrine terms: ${violations.join(', ')}`);
    }
  });
  return errors;
}

function unusedOperations(keys) {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const used = new Set(keys.map((key) => key.operation));
  return schema.properties.operation.enum.filter((op) => !used.has(op));
}

/**
 * Résolution de provenance — volontairement défensive : le registre de
 * concepts est réécrit indépendamment (IDs renommés au fil des refontes),
 * donc l'échec de résolution n'invalide jamais une clé.
 * `conceptIds` (Set ou tableau) permet d'injecter un référentiel déterministe.
 */
function conceptArraysFromRegistry() {
  const mod = require('../philosophy/conceptDefinitions');
  return [
    mod.CONCEPT_DEFINITIONS,
    mod.ALL_CONCEPTS,
    mod.AESTHETICS_DEFINITIONS,
    mod.LOGIC_DEFINITIONS,
    mod.MATHEMATICS_DEFINITIONS
  ];
}

function optionalConceptModule(moduleName, exportName) {
  try {
    const mod = require(`../philosophy/${moduleName}`);
    return mod[exportName];
  } catch (e) {
    return null;
  }
}

function loadConceptIds() {
  const arrays = [
    ...conceptArraysFromRegistry(),
    optionalConceptModule('aestheticsDefinitions', 'AESTHETICS_DEFINITIONS'),
    optionalConceptModule('logicDefinitions', 'LOGIC_DEFINITIONS'),
    optionalConceptModule('mathematicsDefinitions', 'MATHEMATICS_DEFINITIONS'),
    optionalConceptModule('coreDefinitions', 'CORE_DEFINITIONS')
  ].filter((list) => Array.isArray(list));
  if (arrays.length === 0) return null;
  const concepts = arrays.flat();
  return new Set(concepts.map((concept) => concept.id));
}

function resolveProvenance(keys = COGNITIVE_KEYS, conceptIds = null) {
  const ids = conceptIds ? new Set(conceptIds) : loadConceptIds();
  if (!ids) {
    return { available: false, resolved: [], unresolved: [], note: 'concept registry unavailable' };
  }
  const resolved = [];
  const unresolved = [];
  keys.forEach((key) => {
    (key.derivedFrom || []).forEach((conceptId) => {
      const entry = { key: key.id, concept: conceptId };
      (ids.has(conceptId) ? resolved : unresolved).push(entry);
    });
  });
  return { available: true, resolved, unresolved };
}

function validateRegistry(keys = COGNITIVE_KEYS) {
  const normalized = keys.map(normalizeKey);
  const errors = [];
  normalized.forEach((key, index) => {
    const result = validateSpec(KEY_SCHEMA, key);
    if (!result.valid) {
      errors.push(...result.errors.map((error) => `keys[${index}]: ${error}`));
    }
    errors.push(...validateKeyFields(key, index));
  });

  const duplicates = duplicateIds(normalized);
  if (duplicates.length) errors.push(`duplicate key ids: ${duplicates.join(', ')}`);
  errors.push(...crossReferenceErrors(normalized));
  errors.push(...doctrineErrors(normalized));

  const unused = unusedOperations(normalized);
  if (unused.length) {
    errors.push(`unused operation vocabulary (decorative enum values): ${unused.join(', ')}`);
  }

  return { valid: errors.length === 0, keys: normalized, errors };
}

function registryHealth() {
  const result = validateRegistry();
  const provenance = resolveProvenance();
  return {
    valid: result.valid,
    keyCount: result.keys.length,
    duplicateIds: duplicateIds(result.keys),
    errors: result.errors,
    provenance
  };
}

module.exports = {
  normalizeKey,
  validateRegistry,
  registryHealth,
  resolveProvenance,
  unusedOperations
};
