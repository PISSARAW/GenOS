"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function inhibitoryEdgeFrom(input = {}) {
  return {
    id: input.id || `${input.from}::|::${input.to}`,
    from: input.from || "unknown",
    to: input.to || "unknown",
    type: "inhibitory",
    condition: input.condition || {},
    strength: clamp01(Number(input.strength) || 0.5),
    triggeredCount: Number(input.triggeredCount) || 0,
    lastTriggeredAt: input.lastTriggeredAt || null,
    active: input.active != null ? Boolean(input.active) : true,
  };
}

function isInhibitory(edge) {
  return String(edge?.type || "").toLowerCase() === "inhibitory";
}

function isInhibited(edge, context = {}) {
  if (!isInhibitory(edge)) return false;
  if (!edge.active) return false;
  if (!edge.condition || typeof edge.condition !== "object") return false;
  const ctx = context || {};
  for (const k of Object.keys(edge.condition)) {
    const expected = edge.condition[k];
    const actual = ctx[k];
    if (String(actual ?? "") !== String(expected)) return false;
  }
  return true;
}

function inhibitionStrength(edge, context = {}) {
  if (!isInhibited(edge, context)) return 0;
  return clamp01(Number(edge.strength) || 0.5);
}

function effectiveTransitionScore(baseScore, edge, context = {}) {
  if (!isInhibitory(edge)) return baseScore;
  const inhib = inhibitionStrength(edge, context);
  return baseScore * (1 - inhib);
}

function trigger(edge, context = {}) {
  const e = Object.assign({}, edge);
  if (!isInhibited(e, context)) return e;
  return Object.assign(e, {
    triggeredCount: e.triggeredCount + 1,
    lastTriggeredAt: new Date().toISOString(),
  });
}

function deactivate(edge) {
  return Object.assign({}, edge, { active: false, deactivatedAt: new Date().toISOString() });
}

function reactivate(edge) {
  return Object.assign({}, edge, { active: true });
}

module.exports = {
  inhibitoryEdgeFrom,
  isInhibitory,
  isInhibited,
  inhibitionStrength,
  effectiveTransitionScore,
  trigger,
  deactivate,
  reactivate,
};
