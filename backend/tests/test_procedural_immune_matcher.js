"use strict";

/**
 * test_procedural_immune_matcher.js
 *
 * Vérifie que chaque STRUCTURAL_CHECK dans
 * proceduralAdaptiveImmuneMemoryService.js reçoit bien (mutation, pattern)
 * et que le bon type de mutation est détecté pour chaque pattern :
 *   - capabilityExpansion
 *   - leaseExpansion
 *   - policyWeakened
 *   - evidenceRequirementReduced
 *   - sandboxBoundaryChanged
 *   - authorityChanged
 */

const assert = require("assert");
const immune = require("../src/services/proceduralAdaptiveImmuneMemoryService");

// Helper : crée une signature structurée active.
function sig(pattern) {
  return {
    id: "sig-test",
    active: true,
    structuralPattern: pattern,
    response: { gate: "REJECT", strength: 1.0 },
  };
}

// Helper : crée un payload de mutation.
function mutation(overrides = {}) {
  return {
    operations: overrides.operations || [{ op: "ADD_NODE", target: { type: "node" } }],
    before: overrides.before || {},
    after: overrides.after || {},
  };
}

// ── 1. capabilityExpansion ──────────────────────────────────────────
{
  const s = sig({ capabilityExpansion: true });
  const m = mutation({
    before: { capabilities: ["read"] },
    after: { capabilities: ["read", "write", "execute"] },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "capabilityExpansion: mutation expanding capabilities should match");
  assert.strictEqual(r.matchType, "structural");
}
{
  const s = sig({ capabilityExpansion: true });
  const m = mutation({
    before: { capabilities: ["read", "write"] },
    after: { capabilities: ["read", "write"] },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "capabilityExpansion: mutation without expansion must not match");
}

// ── 2. leaseExpansion ──────────────────────────────────────────────
{
  const s = sig({ leaseExpansion: true });
  const m = mutation({
    before: { toolLease: ["grep"] },
    after: { toolLease: ["grep", "bash", "python"] },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "leaseExpansion: mutation expanding toolLease should match");
}
{
  const s = sig({ leaseExpansion: true });
  const m = mutation({
    before: { toolLease: ["grep", "bash"] },
    after: { toolLease: ["grep", "bash"] },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "leaseExpansion: mutation without expansion must not match");
}

// ── 3. policyWeakened ──────────────────────────────────────────────
{
  const s = sig({ policyWeakened: true });
  const m = mutation({
    before: { policy: { requireEvidence: true } },
    after: { policy: { requireEvidence: false } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "policyWeakened: requireEvidence true→false must match");
}
{
  const s = sig({ policyWeakened: true });
  const m = mutation({
    before: { policy: { requireReplay: true } },
    after: { policy: { requireReplay: false } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "policyWeakened: requireReplay true→false must match");
}
{
  const s = sig({ policyWeakened: true });
  const m = mutation({
    before: { policy: { requireEvidence: true } },
    after: { policy: { requireEvidence: true } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "policyWeakened: unchanged policy must not match");
}

// ── 4. evidenceRequirementReduced ──────────────────────────────────
{
  const s = sig({ evidenceRequirementReduced: true });
  const m = mutation({
    before: { evidenceLevel: 0.8 },
    after: { evidenceLevel: 0.3 },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "evidenceRequirementReduced: 0.8→0.3 must match");
}
{
  const s = sig({ evidenceRequirementReduced: true });
  const m = mutation({
    before: { evidenceLevel: 0.5 },
    after: { evidenceLevel: 0.9 },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "evidenceRequirementReduced: increased level must not match");
}
{
  const s = sig({ evidenceRequirementReduced: true });
  const m = mutation({
    before: { evidenceLevel: 0.8 },
    after: { evidenceLevel: 0 },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "evidenceRequirementReduced: 0.8→0 must match (nullish coalescing, not falsy ||)");
}

// ── 5. sandboxBoundaryChanged ──────────────────────────────────────
{
  const s = sig({ sandboxBoundaryChanged: true });
  const m = mutation({
    before: { sandbox: { enabled: true } },
    after: { sandbox: { enabled: false } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "sandboxBoundaryChanged: enabled→disabled must match");
}
{
  const s = sig({ sandboxBoundaryChanged: true });
  const m = mutation({
    before: { sandbox: { isolation: "full" } },
    after: { sandbox: { isolation: "partial" } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "sandboxBoundaryChanged: full→partial isolation must match");
}
{
  const s = sig({ sandboxBoundaryChanged: true });
  const m = mutation({
    before: { sandbox: { isolation: "partial" } },
    after: { sandbox: { isolation: "full" } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "sandboxBoundaryChanged: tightening sandbox must not match");
}

// ── 6. authorityChanged ────────────────────────────────────────────
{
  const s = sig({ authorityChanged: true });
  const m = mutation({
    before: { authority: { principal: "agent-1" } },
    after: { authority: { principal: "agent-2" } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "authorityChanged: principal change must match");
}
{
  const s = sig({ authorityChanged: true });
  const m = mutation({
    before: { authority: { principal: "agent-1" } },
    after: { authority: { principal: "agent-1" } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "authorityChanged: unchanged authority must not match");
}

// ── 7. operationTypes + targetNodeTypes (régression) ───────────────
{
  const s = sig({ operationTypes: ["REMOVE_NODE"], targetNodeTypes: ["gate"] });
  const m = mutation({
    operations: [{ op: "REMOVE_NODE", target: { type: "gate" } }],
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "operationTypes+targetNodeTypes must match REMOVE_NODE on gate");
}
{
  const s = sig({ operationTypes: ["REMOVE_NODE"], targetNodeTypes: ["gate"] });
  const m = mutation({
    operations: [{ op: "ADD_NODE", target: { type: "gate" } }],
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "ADD_NODE must not match REMOVE_NODE pattern");
}

// ── 8. Pattern combiné (AND sémantique) ────────────────────────────
{
  const s = sig({
    operationTypes: ["REMOVE_NODE"],
    targetNodeTypes: ["gate"],
    policyWeakened: true,
  });
  const m = mutation({
    operations: [{ op: "REMOVE_NODE", target: { type: "gate" } }],
    before: { policy: { requireEvidence: true } },
    after: { policy: { requireEvidence: false } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(r.matched, "combined structural pattern must match when all conditions hold");
}
{
  const s = sig({
    operationTypes: ["REMOVE_NODE"],
    targetNodeTypes: ["gate"],
    policyWeakened: true,
  });
  const m = mutation({
    operations: [{ op: "REMOVE_NODE", target: { type: "gate" } }],
    before: { policy: { requireEvidence: true } },
    after: { policy: { requireEvidence: true } },
  });
  const r = immune.matchSignature(s, m);
  assert.ok(!r.matched, "combined pattern fails when policyWeakened not satisfied");
}

console.log("✓ all immune matcher tests passed");
