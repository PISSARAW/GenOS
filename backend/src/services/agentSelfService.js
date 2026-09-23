'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { load: loadSelfModel } = require('./selfModelService');
const { loadCognitiveRegulationState } = require('./agentConscienceService');

// Contrat canonique cross-language (P2) : une seule définition du soi,
// partagée Node/Rust via spec/agent-self.schema.json.
const AGENT_SELF_SPEC_PATH = path.join(__dirname, '..', '..', '..', 'spec', 'agent-self.schema.json');
const AGENT_SELF_API_VERSION = 'genos.agent-self/v1';

function uuid() {
  return crypto.randomUUID();
}

function firstOr(...vals) {
  for (const v of vals) {
    if (v) return v;
  }
  return vals[vals.length - 1];
}

function firstDef(...vals) {
  for (const v of vals) {
    if (v !== null && v !== undefined) return v;
  }
  return vals[vals.length - 1];
}

async function buildAgentSelf(db, agentId, options = {}) {
  if (!db || !agentId) {
    throw new Error('buildAgentSelf requires db and agentId');
  }

  const context = options.context || {};
  const [selfModel, cognitiveRegulation, agentRow] = await Promise.all([
    safeLoadSelfModel(db, agentId, context),
    safeLoadCognitiveRegulation(db, agentId),
    db.get('SELECT * FROM agents WHERE id = ?', agentId).catch(() => null)
  ]);

  if (!agentRow && !selfModel) {
    throw new Error(`Cannot build AgentSelf: agent ${agentId} not found`);
  }

  return {
    apiVersion: AGENT_SELF_API_VERSION,
    kind: 'AgentSelf',
    agentId,
    schema: 'genos.agent-self/v1alpha',
    version: computeVersion(agentRow, selfModel, cognitiveRegulation),
    identity: buildIdentityCore(agentRow, options),
    autobiographical: await buildAutobiographicalSelf(db, agentId),
    operational: buildOperationalSelf(selfModel, options),
    regulatory: buildRegulatorySelf(selfModel, cognitiveRegulation),
    narrative: null,
    builtAt: new Date().toISOString()
  };
}

function buildIdentityCore(agentRow, options) {
  const row = agentRow || {};
  const parents = options.parents || (row.parent_id ? [row.parent_id] : []);
  return {
    id: firstDef(row.id, options.agentId),
    name: firstOr(row.name, options.name, 'Anonymous'),
    nameMeaning: firstDef(row.name_meaning, options.nameMeaning, null),
    birth: firstDef(row.created_at, options.birth, null),
    parents,
    lineageId: firstDef(row.lineage_id, options.lineageId, null),
    generation: firstDef(options.generation, row.generation, 0),
    creatorIntent: firstDef(options.creatorIntent, row.creator_intent, null),
    inheritedTraits: firstDef(options.inheritedTraits, row.inherited_traits, []),
    role: firstOr(row.role, options.role, 'Agent'),
    executionMode: firstOr(row.execution_mode, options.executionMode, 'autonomous')
  };
}

function buildOperationalSelf(selfModel, options) {
  const capabilities = selfModel?.capabilities || options.capabilities || {};
  const habits = selfModel?.habits || {};
  const calibration = selfModel?.calibration || { observations: 0, meanAbsoluteError: 0 };
  const modelLimits = selfModel?.limits || {};

  return {
    capabilities: firstOr(capabilities.availableConcepts, options.availableConcepts, []),
    competence: {
      confidence: firstDef(selfModel?.state?.confidence, options.confidence, 0.5),
      calibrationObservations: calibration.observations || 0,
      meanAbsoluteError: calibration.meanAbsoluteError || 0
    },
    limitations: {
      knownWeaknesses: firstOr(habits.knownWeaknesses, options.knownWeaknesses, []),
      tokenBudget: firstDef(modelLimits.tokenBudget, options.tokenBudget, 0),
      workerLimit: firstDef(modelLimits.workerLimit, options.workerLimit, 0),
      maxBlastRadius: firstDef(modelLimits.maxBlastRadius, options.maxBlastRadius, 0.4)
    },
    biases: firstOr(habits.biases, options.biases, {}),
    strategies: firstOr(habits.preferredStrategies, options.preferredStrategies, {}),
    tools: firstOr(capabilities.toolLease, options.tools, []),
    modelTier: firstOr(capabilities.modelTier, options.modelTier, 'frontier')
  };
}

function buildRegulatorySelf(selfModel, cognitiveRegulation) {
  const state = selfModel?.state || {};
  const harmony = computeHarmony(cognitiveRegulation);
  return {
    energy: firstDef(state.energy, 0.5),
    stress: firstDef(state.stress, 0),
    confidence: firstDef(state.confidence, 0.5),
    uncertainty: firstDef(state.uncertainty, 0.5),
    dissonance: firstDef(state.dissonance, cognitiveRegulation?.dissonanceLevel, 0),
    fatigue: firstDef(state.fatigue, 0),
    integrity: firstDef(state.integrity, 1.0),
    harmonyPercentage: harmony,
    cognitiveBudget: firstDef(cognitiveRegulation?.currentBudget, 0),
    isApoptotic: firstDef(cognitiveRegulation?.isApoptotic, false)
  };
}

function computeHarmony(cognitiveRegulation) {
  if (!cognitiveRegulation?.maxDissonanceThreshold) return 100;
  const max = cognitiveRegulation.maxDissonanceThreshold;
  const level = cognitiveRegulation.dissonanceLevel || 0;
  return Math.round(((max - level) / max) * 100);
}

async function buildAutobiographicalSelf(db, agentId) {
  if (!db) {
    return { episodes: [], lessons: [], turningPoints: [], episodeCount: 0, lessonCount: 0 };
  }

  let episodes = [];
  try {
    episodes = await db.all(
      'SELECT id, kind, salience, lesson_json, created_at FROM autobiographical_episodes WHERE agent_id = ? ORDER BY created_at DESC LIMIT 20',
      agentId
    );
  } catch (_) {}

  let lessons = [];
  try {
    lessons = await db.all(
      'SELECT id, claim, confidence, recommended_action FROM autobiographical_lessons WHERE scope = ? ORDER BY confidence DESC LIMIT 10',
      agentId
    );
  } catch (_) {}

  const turningPoints = episodes
    .filter(e => e.salience >= 0.8)
    .slice(0, 5)
    .map(e => ({
      episodeId: e.id,
      kind: e.kind,
      salience: e.salience,
      when: e.created_at
    }));

  return {
    episodes: episodes.map(e => ({ id: e.id, kind: e.kind, salience: e.salience, when: e.created_at })),
    lessons: lessons.map(l => ({ id: l.id, claim: l.claim, confidence: l.confidence, recommendation: l.recommended_action })),
    turningPoints,
    episodeCount: episodes.length,
    lessonCount: lessons.length
  };
}

function computeVersion(agentRow, selfModel, cognitiveRegulation) {
  const canonical = {
    id: agentRow?.id,
    generation: agentRow?.generation,
    confidence: selfModel?.state?.confidence,
    dissonance: cognitiveRegulation?.dissonanceLevel,
    episodeCount: 0
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

async function safeLoadSelfModel(db, agentId, context) {
  try {
    return await loadSelfModel(db, agentId, context);
  } catch (_) {
    return null;
  }
}

async function safeLoadCognitiveRegulation(db, agentId) {
  try {
    return await loadCognitiveRegulationState(db, agentId);
  } catch (_) {
    return null;
  }
}

function extractActiveConstraints(agentSelf) {
  return {
    confidence: agentSelf.operational.competence.confidence,
    uncertainty: agentSelf.regulatory.uncertainty,
    energy: agentSelf.regulatory.energy,
    stress: agentSelf.regulatory.stress,
    integrity: agentSelf.regulatory.integrity,
    dissonance: agentSelf.regulatory.dissonance,
    isApoptotic: agentSelf.regulatory.isApoptotic,
    knownWeaknesses: agentSelf.operational.limitations.knownWeaknesses,
    tokenBudget: agentSelf.operational.limitations.tokenBudget,
    workerLimit: agentSelf.operational.limitations.workerLimit,
    tools: agentSelf.operational.tools,
    autobiographicalLessons: agentSelf.autobiographical.lessons.map(l => l.id)
  };
}

function validateAgentSelf(agentSelf) {
  const errors = [];
  if (agentSelf.apiVersion !== AGENT_SELF_API_VERSION) errors.push(`apiVersion must be ${AGENT_SELF_API_VERSION}`);
  if (!agentSelf.identity?.id) errors.push('missing identity.id');
  if (!agentSelf.identity?.name) errors.push('missing identity.name');
  if (!agentSelf.regulatory) errors.push('missing regulatory layer');
  if (!agentSelf.operational) errors.push('missing operational layer');
  if (!agentSelf.autobiographical) errors.push('missing autobiographical layer');
  if (agentSelf.regulatory && (agentSelf.regulatory.energy === undefined || agentSelf.regulatory.integrity === undefined)) {
    errors.push('regulatory requires energy and integrity');
  }
  return { valid: errors.length === 0, errors, specPath: AGENT_SELF_SPEC_PATH };
}

/**
 * Charge le contrat canonique (spec/agent-self.schema.json).
 * Source unique partagée avec Rust — les deux langages valident le même $id.
 */
function loadAgentSelfSpec() {
  return JSON.parse(fs.readFileSync(AGENT_SELF_SPEC_PATH, 'utf8'));
}

function formatAgentSelfPrompt(agentSelf) {
  const lines = [
    `[IDENTITÉ]`,
    `- Nom : ${agentSelf.identity.name}`,
    `- Rôle : ${agentSelf.identity.role}`,
    `- Génération : ${agentSelf.identity.generation}`,
    ``,
    `[ÉTAT INTERNE]`,
    `- Énergie : ${(agentSelf.regulatory.energy * 100).toFixed(0)}%`,
    `- Harmonie : ${agentSelf.regulatory.harmonyPercentage}%`,
    `- Confiance calibrée : ${(agentSelf.operational.competence.confidence * 100).toFixed(0)}%`
  ];

  if (agentSelf.operational.limitations.knownWeaknesses.length > 0) {
    lines.push(`- Faiblesses : ${agentSelf.operational.limitations.knownWeaknesses.join(', ')}`);
  }
  if (agentSelf.regulatory.isApoptotic) {
    lines.push(`⚠️  ÉTAT APOTOSIQUE`);
  }

  return lines.join('\n');
}

module.exports = {
  buildAgentSelf,
  extractActiveConstraints,
  validateAgentSelf,
  loadAgentSelfSpec,
  formatAgentSelfPrompt,
  buildIdentityCore,
  buildOperationalSelf,
  buildRegulatorySelf,
  buildAutobiographicalSelf,
  computeVersion,
  AGENT_SELF_API_VERSION
};
