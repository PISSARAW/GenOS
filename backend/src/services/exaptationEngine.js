'use strict';

/**
 * @file exaptationEngine.js
 * @description Moteur d'exaptation computationnelle.
 *
 * L'exaptation est le réinvestissement d'une fonction existante dans un nouveau
 * contexte. En biologie, c'est la source majeure d'innovation.
 *
 * Références : Kassen (2019, PMC66428436), Colizzi et al. (2022, PMC9750852).
 */

const kg = require('./structuralKnowledgeGraph');
const { EXAPTATION_PATTERNS } = require('./exaptationPatterns');

// ─── Helpers ─────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo;
}

function firstTruthy(...args) {
  for (const a of args) if (a) return a;
  return null;
}

function shortName(x) {
  const v = firstTruthy(x && x.name, x && x.id, String(x));
  return v.slice(0, 30);
}

// ─── Analyse de capacité ─────────────────────────────────────────────

function analyzeCapability(capability) {
  const id = firstTruthy(capability.id, capability.name, capability);
  const origin = firstTruthy(capability.origin_context, capability.context, 'contexte non spécifié');
  const role = firstTruthy(capability.original_role, capability.role, 'capacité');

  return {
    id,
    origin_context: origin,
    original_role: role,
    features: extractFeatures(capability),
    transferable_elements: extractTransferableElements(capability),
    origin_scale: capability.origin_scale || 'local',
  };
}

function extractFeatures(capability) {
  const features = [];
  const tools = capability.tools || [];
  const caps = capability.capabilities || [];

  if (tools.length) features.push({ type: 'tool', value: tools.join(', ') });
  if (caps.length) features.push({ type: 'capability', value: caps.join(', ') });
  if (capability.strategy) features.push({ type: 'strategy', value: capability.strategy });
  if (capability.prompt) {
    const words = String(capability.prompt).split(' ').filter((w) => w.length > 4);
    if (words.length) features.push({ type: 'knowledge', value: words.slice(0, 5).join(' ') });
  }

  return features;
}

function extractTransferableElements(capability) {
  const elements = [];
  if (capability.tools && capability.tools.length) {
    elements.push({ type: 'tool', elements: capability.tools, transferable: true });
  }
  if (capability.capabilities && capability.capabilities.length) {
    elements.push({ type: 'capability', elements: capability.capabilities, transferable: true });
  }
  if (capability.prompt) {
    elements.push({ type: 'knowledge', elements: [String(capability.prompt)], transferable: true });
  }
  return elements;
}

// ─── Évaluation de l'exaptation ─────────────────────────────────────

function countOverlap(textA, textB) {
  const a = textA.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const b = textB.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let count = 0;
  for (const w of a) if (setB.has(w)) count++;
  return count;
}

function computeAlignment(analysis, newContext) {
  if (!newContext) return 0;
  const ctxText = JSON.stringify(newContext).toLowerCase();
  let score = 0;
  for (const f of analysis.features) {
    score += countOverlap(JSON.stringify(f).toLowerCase(), ctxText);
  }
  if (analysis.transferable_elements.length > 0) score += 0.3;
  return clamp(score / Math.max(1, analysis.features.length || 1), 0, 1);
}

function computeNovelty(analysis, newContext) {
  if (!newContext) return 0;
  const origin = analysis.origin_context.toLowerCase();
  const target = JSON.stringify(newContext).toLowerCase();
  const shared = countOverlap(origin, target);
  const maxLen = Math.max(origin.length, target.length, 1);
  return clamp(1 - shared / maxLen, 0, 1);
}

function computeFeasibility(analysis, pattern) {
  const riskMap = {
    'Réutilisation intégrale': 0.9,
    'Changement de rôle': 0.8,
    'Extraction d\'abstraction': 0.7,
    'Réutilisation de fragment': 0.6,
    'Changement d\'échelle': 0.5,
    'Combinaison innovante': 0.4,
  };
  return riskMap[pattern.label || pattern] || 0.5;
}

function evaluateExaptation(capability, newContext, pattern) {
  const analysis = analyzeCapability(capability);
  const alignment = computeAlignment(analysis, newContext);
  const novelty = computeNovelty(analysis, newContext);
  const feasibility = computeFeasibility(analysis, pattern);

  return {
    capability_id: analysis.id,
    new_context: newContext,
    pattern: pattern.label,
    alignment_score: alignment,
    novelty_score: novelty,
    feasibility_score: feasibility,
    exaptation_score: (alignment + novelty + feasibility) / 3,
    questions: [
      pattern.question(analysis, newContext),
      'La propriété "' + analysis.id + '" conserve-t-elle sa valeur dans le nouveau contexte ?',
    ],
    analysis,
  };
}

// ─── Recherche de cibles d'exaptation ─────────────────────────────

async function findExaptationTargets(capability, context, options) {
  const analysis = analyzeCapability(capability);
  const features = analysis.features.map((f) => f.value).join(' ');

  const traits = await kg.searchTraits({
    query: features.slice(0, 50) || analysis.id,
    limit: 30,
    db: context && context.db,
  });

  return (traits && traits.traits || []).map((t) => ({
    id: t.trait_id,
    context: t.description || t.trait_name,
    domain: t.promotion_level >= 1 ? 'validated' : 'exploratory',
  })).slice(0, 20);
}

// ─── Génération de propositions d'exaptation ──────────────────────

async function generateExaptations(capability, context, options) {
  options = options || {};
  const patterns = options.patterns || Object.keys(EXAPTATION_PATTERNS).map((k) => EXAPTATION_PATTERNS[k]);
  const targets = await findExaptationTargets(capability, context, options);

  const propositions = [];
  for (const target of targets) {
    for (const pattern of patterns) {
      propositions.push(evaluateExaptation(capability, target, pattern));
    }
  }

  propositions.sort((a, b) => b.exaptation_score - a.exaptation_score);
  const best = propositions.length > 0 ? propositions[0] : null;

  return {
    capability: analyzeCapability(capability),
    targets,
    propositions: propositions.slice(0, options.limit || 20),
    best,
    reason: 'Généré ' + propositions.length + ' propositions d\'exaptation',
  };
}

// ─── Questionnement systématique ────────────────────────────────────

function systematicExaptationQuery(capability, context) {
  const analysis = analyzeCapability(capability);
  const problem = context && context.problem || 'un nouveau problème';
  const second = context && context.second_capability || '?';
  const targetRole = context && context.target_role || '?';

  const questions = [
    { type: 'direct_reuse', question: analysis.id + ' a été créé pour ' + analysis.origin_context + '. Peut-il résoudre ' + problem + ' ?', pattern: EXAPTATION_PATTERNS.full_reuse },
    { type: 'fragment', question: 'Un fragment de ' + analysis.id + ' peut-il résoudre un sous-problème ?', pattern: EXAPTATION_PATTERNS.fragment_reuse },
    { type: 'combination', question: analysis.id + ' + ' + second + ' peut-il créer une nouvelle capacité ?', pattern: EXAPTATION_PATTERNS.combination },
    { type: 'role_shift', question: analysis.id + ' peut-il devenir ' + targetRole + ' ?', pattern: EXAPTATION_PATTERNS.role_shift },
    { type: 'scale_shift', question: analysis.id + ' peut-il opérer à une autre échelle ?', pattern: EXAPTATION_PATTERNS.scale_shift },
    { type: 'abstraction', question: 'L\'abstraction sous-jacente de ' + analysis.id + ' peut-elle être extraite ?', pattern: EXAPTATION_PATTERNS.abstraction_extraction },
  ];

  return { capability: analysis, questions, context };
}

// ─── Intégration ────────────────────────────────────────────────────

function exaptationToRepresentation(exaptationResult) {
  if (!exaptationResult || !exaptationResult.best) return null;
  const best = exaptationResult.best;
  return {
    id: 'exapt_' + best.capability_id + '_' + Date.now(),
    name: 'Exaptation: ' + best.capability_id + ' → ' + (best.new_context && best.new_context.id || '?'),
    representationType: 'exaptation',
    description: best.questions[0],
    source_capability: best.capability_id,
    target_context: best.new_context,
    pattern: best.pattern,
    confidence: best.exaptation_score,
    provenance: { generated_by: 'exaptationEngine', generated_at: new Date().toISOString() },
  };
}

module.exports = {
  EXAPTATION_PATTERNS,
  analyzeCapability,
  evaluateExaptation,
  findExaptationTargets,
  generateExaptations,
  systematicExaptationQuery,
  exaptationToRepresentation,
  countOverlap,
  computeAlignment,
  computeNovelty,
  computeFeasibility,
};
