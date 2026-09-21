"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function fragmentFrom(procedure, context = {}) {
  return {
    id: `frag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    source: procedure?.id || null,
    procedure,
    validated: false,
    trace: [],
    context,
  };
}

function validateFragment(fragment, validator = null) {
  const ok = validator ? validator(fragment) : fragment.procedure != null;
  return { ...fragment, validated: ok, validatedAt: ok ? new Date().toISOString() : null };
}

function assimilate(target, fragment) {
  if (!fragment.validated) return target;
  const allowedFields = fragment.allowedFields || ['role', 'strategy', 'tools', 'capabilities', 'prompt'];
  const merged = { ...target };
  for (const field of allowedFields) {
    if (fragment.procedure?.[field] != null) {
      merged[field] = fragment.procedure[field];
    }
  }
  merged.assimilatedFrom = fragment.source;
  merged.assimilatedAt = new Date().toISOString();
  return merged;
}

function tracePropagation(fragments) {
  return fragments.map((f) => ({ id: f.id, source: f.source, validated: f.validated }));
}

module.exports = {
  fragmentFrom,
  validateFragment,
  assimilate,
  tracePropagation,
};
