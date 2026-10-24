'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const schemaPath = path.resolve(__dirname, '../../..', 'spec/social-mental-model.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requiredText(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail('SOCIAL_MODEL_INVALID', `${name} is required.`);
  return value.trim();
}

function normalizeMemory(memory, index) {
  const normalized = {
    id: requiredText(memory?.id, `memories[${index}].id`),
    subjectAgentId: requiredText(memory?.subjectAgentId, `memories[${index}].subjectAgentId`),
    otherAgentId: requiredText(memory?.otherAgentId, `memories[${index}].otherAgentId`),
    relationType: requiredText(memory?.relationType, `memories[${index}].relationType`),
    polarity: memory?.polarity,
    statement: requiredText(memory?.statement, `memories[${index}].statement`),
    receiptId: requiredText(memory?.receiptId, `memories[${index}].receiptId`),
    occurredAt: requiredText(memory?.occurredAt, `memories[${index}].occurredAt`),
    beliefAboutOther: memory?.beliefAboutOther || null,
  };
  if (!['supports', 'contradicts'].includes(normalized.polarity)) fail('SOCIAL_MODEL_INVALID', 'Memory polarity must be supports or contradicts.');
  if (!Number.isFinite(Date.parse(normalized.occurredAt))) fail('SOCIAL_MODEL_INVALID', 'Memory occurredAt must be a date.');
  if (normalized.beliefAboutOther) normalizeBelief(normalized.beliefAboutOther, normalized.id);
  return normalized;
}

function normalizeBelief(belief, memoryId) {
  if (!belief || typeof belief.proposition !== 'string' || !belief.proposition.trim()
    || typeof belief.confidence !== 'number' || belief.confidence < 0 || belief.confidence > 1) {
    fail('SOCIAL_MODEL_INVALID', `Memory '${memoryId}' has an invalid beliefAboutOther.`);
  }
}

function scopedMemories(input, subjectAgentId, otherAgentId) {
  if (!Array.isArray(input.memories)) fail('SOCIAL_MODEL_INVALID', 'memories must be an array.');
  const memories = input.memories.map(normalizeMemory);
  const ids = memories.map((memory) => memory.id);
  if (new Set(ids).size !== ids.length) fail('SOCIAL_MODEL_INVALID', 'Memory ids must be unique.');
  return memories.filter((memory) => memory.subjectAgentId === subjectAgentId && memory.otherAgentId === otherAgentId)
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id));
}

function relationHypotheses(memories) {
  const groups = new Map();
  for (const memory of memories) {
    if (!groups.has(memory.relationType)) groups.set(memory.relationType, { support: [], contradiction: [] });
    groups.get(memory.relationType)[memory.polarity === 'supports' ? 'support' : 'contradiction'].push(memory.id);
  }
  if (!groups.size) return [{ relationType: 'unknown', confidence: 0, supportingMemoryIds: [], contradictingMemoryIds: [] }];
  return [...groups.entries()].map(([relationType, evidence]) => ({
    relationType,
    confidence: (evidence.support.length + 1) / (evidence.support.length + evidence.contradiction.length + 2),
    supportingMemoryIds: evidence.support,
    contradictingMemoryIds: evidence.contradiction,
  })).sort((left, right) => right.confidence - left.confidence || left.relationType.localeCompare(right.relationType));
}

function beliefsAboutOther(memories) {
  const beliefs = new Map();
  for (const memory of memories) {
    const belief = memory.beliefAboutOther;
    if (!belief) continue;
    const proposition = belief.proposition.trim();
    if (!beliefs.has(proposition)) beliefs.set(proposition, { total: 0, memoryIds: [] });
    const entry = beliefs.get(proposition);
    entry.total += belief.confidence;
    entry.memoryIds.push(memory.id);
  }
  return [...beliefs.entries()].map(([proposition, value]) => ({
    proposition, confidence: value.total / value.memoryIds.length,
    sourceMemoryIds: [...new Set(value.memoryIds)],
  }));
}

function unknowns(memories, beliefs) {
  const values = [];
  if (memories.length < 2) values.push('La relation repose sur moins de deux souvenirs indépendants.');
  values.push("L'état actuel de la relation n'est pas directement observé.");
  if (beliefs.length === 0) values.push("Aucun souvenir ne précise ce que l'autre agent sait ou croit.");
  if (!memories.some((memory) => memory.polarity === 'contradicts')) values.push('Aucun souvenir contradictoire ne permet de tester une interprétation alternative.');
  return values;
}

function assertValidModel(model) {
  if (!validate(model)) fail('SOCIAL_MODEL_INVALID', ajv.errorsText(validate.errors));
  return model;
}

function validateSocialMentalModel(model) {
  return Boolean(validate(model));
}

function buildSocialMentalModel(input = {}) {
  const subjectAgentId = requiredText(input.subjectAgentId, 'subjectAgentId');
  const otherAgentId = requiredText(input.otherAgentId, 'otherAgentId');
  if (subjectAgentId === otherAgentId) fail('SOCIAL_MODEL_INVALID', 'A social model requires two distinct agents.');
  const memories = scopedMemories(input, subjectAgentId, otherAgentId);
  const beliefs = beliefsAboutOther(memories);
  const model = {
    schemaVersion: 1, subjectAgentId, otherAgentId,
    relationHypotheses: relationHypotheses(memories),
    beliefsAboutOther: beliefs,
    unknowns: unknowns(memories, beliefs),
    alternativeInterpretations: memories.filter((memory) => memory.polarity === 'contradicts').map((memory) => memory.statement),
    sourceMemoryIds: memories.map((memory) => memory.id),
    generatedAt: input.generatedAt || new Date().toISOString(),
    authority: 'descriptive-only', promotionEligible: false,
  };
  return assertValidModel(model);
}

module.exports = { buildSocialMentalModel, validateSocialMentalModel };
