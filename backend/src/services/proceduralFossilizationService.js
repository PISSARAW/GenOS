"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function fossilRecord(input = {}) {
  return {
    id: input.id || `foss-${Date.now()}`,
    genotype: input.genotype || null,
    phenotype: input.phenotype || null,
    niche: input.niche || null,
    mutations: input.mutations || [],
    fitnessHistory: input.fitnessHistory || [],
    causalEvidence: input.causalEvidence || [],
    failureCause: input.failureCause || null,
    descendants: input.descendants || [],
    fossilizedAt: new Date().toISOString(),
  };
}

function fossilize(input = {}) {
  return fossilRecord(input);
}

function fossilLineage(fossils = []) {
  const byId = new Map();
  for (const f of fossils) byId.set(f.id, f);
  const roots = fossils.filter((f) => !f.parentId);
  return roots.map((r) => collectDescendants(r, byId));
}

function collectDescendants(fossil, byId) {
  const children = fossil.descendants
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((c) => collectDescendants(c, byId));
  return { ...fossil, children };
}

function fossilSummary(fossil) {
  return {
    id: fossil.id,
    niche: fossil.niche?.id || null,
    fitness: fossil.fitnessHistory.length ? fossil.fitnessHistory[fossil.fitnessHistory.length - 1] : null,
    failureCause: fossil.failureCause || fossil.failureCause || null,
    descendants: fossil.descendants.length,
  };
}

module.exports = {
  fossilRecord,
  fossilize,
  fossilLineage,
  fossilSummary,
};
