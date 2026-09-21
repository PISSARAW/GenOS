'use strict';

/**
 * @file culturalSelectionService.js
 * @description Sélection culturelle : quelles pratiques survivent et se propagent.
 */

// ─── Critères de sélection ──────────────────────────────────────────

const SELECTION_CRITERIA = {
  usefulness: { label: 'Utilité', weight: 0.3 },
  evidence: { label: 'Preuve', weight: 0.25 },
  prestige: { label: 'Prestige', weight: 0.15 },
  reliability: { label: 'Fiabilité', weight: 0.15 },
  contextualFit: { label: 'Adéquation', weight: 0.15 },
};

// ─── Évaluation d'un trait culturel ─────────────────────────────────

function evaluateCulturalTrait(trait, context) {
  const scores = {
    usefulness: trait.utility ?? 0,
    evidence: trait.evidenceScore ?? trait.quality ?? 0,
    prestige: trait.sourcePrestige ?? 0.5,
    reliability: trait.useCount > 0 ? (trait.successCount / trait.useCount) : 0.3,
    contextualFit: computeContextualFit(trait, context),
  };

  let total = 0;
  let totalWeight = 0;
  for (const key of Object.keys(scores)) {
    const weight = SELECTION_CRITERIA[key] ? SELECTION_CRITERIA[key].weight : 0.1;
    total += scores[key] * weight;
    totalWeight += weight;
  }

  return total > 0 ? total / totalWeight : 0;
}

function computeContextualFit(trait, context) {
  if (!context) return 0.5;
  const traitKeywords = (trait.keywords || []).map((k) => String(k).toLowerCase());
  const contextKeywords = (context.keywords || []).map((k) => String(k).toLowerCase());
  if (!traitKeywords.length || !contextKeywords.length) return 0.5;
  const shared = traitKeywords.filter((k) => contextKeywords.includes(k));
  return shared.length / Math.max(traitKeywords.length, contextKeywords.length);
}

// ─── Sélection de traits ────────────────────────────────────────────

function selectCulturalTraits(traits, context, maxCount) {
  const evaluated = traits.map((trait) => ({
    trait,
    score: evaluateCulturalTrait(trait, context),
  }));

  evaluated.sort((a, b) => b.score - a.score);
  return evaluated.slice(0, maxCount || 10);
}

// ─── Abandon de traits obsolètes ────────────────────────────────────

function pruneObsoleteTraits(traits, threshold) {
  const minScore = threshold ?? 0.2;
  const kept = [];
  const pruned = [];

  for (const trait of traits) {
    const score = trait.quality ?? trait.utility ?? 0.5;
    if (score < minScore) {
      pruned.push({ trait, score, reason: 'below_threshold' });
    } else {
      kept.push(trait);
    }
  }

  return { kept, pruned };
}

// ─── Création de traditions ─────────────────────────────────────────

function createTradition(artifactId, agentIds) {
  return {
    id: `trad_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    rootArtifactId: artifactId,
    members: agentIds || [],
    variants: [],
    lineage: [],
    createdAt: new Date().toISOString(),
    strength: 0.5,
  };
}

function addVariantToTradition(tradition, variantArtifact) {
  tradition.variants.push({
    artifactId: variantArtifact.id,
    agentId: variantArtifact.agentId,
    addedAt: new Date().toISOString(),
  });
  tradition.lineage.push(variantArtifact.agentId);
  return tradition;
}

module.exports = {
  SELECTION_CRITERIA,
  evaluateCulturalTrait,
  computeContextualFit,
  selectCulturalTraits,
  pruneObsoleteTraits,
  createTradition,
  addVariantToTradition,
};
