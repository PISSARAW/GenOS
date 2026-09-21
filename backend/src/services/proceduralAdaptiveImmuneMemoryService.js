"use strict";

const identity = require('./proceduralIdentityService');

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

function immuneSignatureFrom(input = {}) {
  return {
    id: input.id || identity.createOccurrenceId('sig'),
    pattern: input.pattern || "",
    mutationPattern: input.mutationPattern || [],
    context: input.context || {},
    response: input.response || { gate: "REJECT", strength: 1.0 },
    createdAt: input.createdAt || new Date().toISOString(),
    active: input.active == null ? true : Boolean(input.active),
  };
}

function matchSignature(signature, mutation) {
  if (!signature.active) return { matched: false };
  const code = (mutation?.code || mutation?.diff || "").toLowerCase();
  const lower = signature.pattern.toLowerCase();
  if (!lower) return { matched: false };
  if (code.includes(lower)) return { matched: true, response: signature.response };
  return { matched: false };
}

function recallRejection(memory, mutation) {
  if (!Array.isArray(memory)) return { rejected: false };
  for (const sig of memory) {
    const r = matchSignature(sig, mutation);
    if (r.matched) return { rejected: true, signatureId: sig.id, response: r.response };
  }
  return { rejected: false };
}

function recordRejection(memory, signature) {
  return [...(Array.isArray(memory) ? memory : []), signature];
}

function strongestResponse(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a.response?.strength > b.response?.strength ? a : b;
}

module.exports = {
  immuneSignatureFrom,
  matchSignature,
  recallRejection,
  recordRejection,
  strongestResponse,
};
