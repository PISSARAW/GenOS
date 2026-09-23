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

function checkOperationTypes(mutation, pattern) {
  if (!pattern.operationTypes) return true;
  const ops = mutation?.operations || [];
  return ops.some(op => pattern.operationTypes.includes(op.op));
}

function checkTargetNodeTypes(mutation, pattern) {
  if (!pattern.targetNodeTypes) return true;
  const ops = mutation?.operations || [];
  return ops.some(op => op.target?.type && pattern.targetNodeTypes.includes(op.target.type));
}

function checkCapabilityExpansion(mutation, pattern) {
  if (pattern.capabilityExpansion !== true) return true;
  const before = mutation?.before?.capabilities || [];
  const after = mutation?.after?.capabilities || [];
  return after.length > before.length && !after.every(c => before.includes(c));
}

function checkLeaseExpansion(mutation, pattern) {
  if (pattern.leaseExpansion !== true) return true;
  const before = mutation?.before?.toolLease || [];
  const after = mutation?.after?.toolLease || [];
  return after.length > before.length && !after.every(c => before.includes(c));
}

function checkPolicyWeakened(mutation, pattern) {
  if (pattern.policyWeakened !== true) return true;
  const before = mutation?.before?.policy || {};
  const after = mutation?.after?.policy || {};
  if (before.requireEvidence === true && after.requireEvidence === false) return true;
  if (before.requireReplay === true && after.requireReplay === false) return true;
  return false;
}

function checkEvidenceRequirementReduced(mutation, pattern) {
  if (pattern.evidenceRequirementReduced !== true) return true;
  const before = mutation?.before?.evidenceLevel ?? 1;
  const after = mutation?.after?.evidenceLevel ?? 1;
  return after < before;
}

function checkSandboxBoundaryChanged(mutation, pattern) {
  if (pattern.sandboxBoundaryChanged !== true) return true;
  const before = mutation?.before?.sandbox || {};
  const after = mutation?.after?.sandbox || {};
  if (before.enabled === true && after.enabled === false) return true;
  if (before.isolation === 'full' && after.isolation !== 'full') return true;
  return false;
}

function checkAuthorityChanged(mutation, pattern) {
  if (pattern.authorityChanged !== true) return true;
  const before = mutation?.before?.authority || {};
  const after = mutation?.after?.authority || {};
  return JSON.stringify(before) !== JSON.stringify(after);
}

const STRUCTURAL_CHECKS = [
  checkOperationTypes,
  checkTargetNodeTypes,
  checkCapabilityExpansion,
  checkLeaseExpansion,
  checkPolicyWeakened,
  checkEvidenceRequirementReduced,
  checkSandboxBoundaryChanged,
  checkAuthorityChanged,
];

function matchStructuralPattern(signature, mutation) {
  if (!signature.structuralPattern) return { matched: false };
  
  const pattern = signature.structuralPattern;
  
  for (const check of STRUCTURAL_CHECKS) {
    if (!check(mutation, pattern)) {
      return { matched: false };
    }
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
  const lower = signature.pattern?.toLowerCase();
  if (lower && code.includes(lower)) return { matched: true, response: signature.response, matchType: 'lexical' };
  
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
