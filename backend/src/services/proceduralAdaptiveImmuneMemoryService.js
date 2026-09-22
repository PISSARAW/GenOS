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
    structuralPattern: input.structuralPattern || null,
    context: input.context || {},
    response: input.response || { gate: "REJECT", strength: 1.0 },
    createdAt: input.createdAt || new Date().toISOString(),
    active: input.active == null ? true : Boolean(input.active),
  };
}

function matchStructuralPattern(signature, mutation) {
  if (!signature.structuralPattern) return { matched: false };
  
  const ops = mutation?.operations || [];
  const pattern = signature.structuralPattern;
  
  // Check for specific operation types
  if (pattern.operationTypes) {
    const hasMatchingOp = ops.some(op => pattern.operationTypes.includes(op.op));
    if (!hasMatchingOp) return { matched: false };
  }
  
  // Check for target node types
  if (pattern.targetNodeTypes) {
    const hasMatchingTarget = ops.some(op => 
      op.target?.type && pattern.targetNodeTypes.includes(op.target.type)
    );
    if (!hasMatchingTarget) return { matched: false };
  }
  
  // Check for affected capabilities expansion
  if (pattern.capabilityExpansion === true) {
    const before = mutation?.before?.capabilities || [];
    const after = mutation?.after?.capabilities || [];
    const expanded = after.length > before.length && !after.every(c => before.includes(c));
    if (!expanded) return { matched: false };
  }
  
  // Check for lease expansion
  if (pattern.leaseExpansion === true) {
    const before = mutation?.before?.toolLease || [];
    const after = mutation?.after?.toolLease || [];
    const expanded = after.length > before.length && !after.every(c => before.includes(c));
    if (!expanded) return { matched: false };
  }
  
  // Check for policy weakening
  if (pattern.policyWeakened === true) {
    const before = mutation?.before?.policy || {};
    const after = mutation?.after?.policy || {};
    if (before.requireEvidence === true && after.requireEvidence === false) return { matched: true };
    if (before.requireReplay === true && after.requireReplay === false) return { matched: true };
    return { matched: false };
  }
  
  // Check for evidence requirement reduction
  if (pattern.evidenceRequirementReduced === true) {
    const before = mutation?.before?.evidenceLevel || 1;
    const after = mutation?.after?.evidenceLevel || 1;
    if (after < before) return { matched: true };
    return { matched: false };
  }
  
  // Check for sandbox boundary changes
  if (pattern.sandboxBoundaryChanged === true) {
    const before = mutation?.before?.sandbox || {};
    const after = mutation?.after?.sandbox || {};
    if (before.enabled === true && after.enabled === false) return { matched: true };
    if (before.isolation === 'full' && after.isolation !== 'full') return { matched: true };
    return { matched: false };
  }
  
  // Check for authority changes
  if (pattern.authorityChanged === true) {
    const before = mutation?.before?.authority || {};
    const after = mutation?.after?.authority || {};
    if (JSON.stringify(before) !== JSON.stringify(after)) return { matched: true };
    return { matched: false };
  }
  
  return { matched: true };
}

function matchSignature(signature, mutation) {
  if (!signature.active) return { matched: false };
  
  // First try structural pattern matching
  const structuralMatch = matchStructuralPattern(signature, mutation);
  if (structuralMatch.matched) {
    return { matched: true, response: signature.response, matchType: 'structural' };
  }
  
  // Fallback to lexical matching for backward compatibility
  const code = (mutation?.code || mutation?.diff || "").toLowerCase();
  const lower = signature.pattern.toLowerCase();
  if (!lower) return { matched: false };
  if (code.includes(lower)) return { matched: true, response: signature.response, matchType: 'lexical' };
  
  return { matched: false };
}

function recallRejection(memory, mutation) {
  if (!Array.isArray(memory)) return { rejected: false };
  for (const sig of memory) {
    const r = matchSignature(sig, mutation);
    if (r.matched) return { rejected: true, signatureId: sig.id, response: r.response, matchType: r.matchType };
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
