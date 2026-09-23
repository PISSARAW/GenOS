'use strict';

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const DANGEROUS_PATTERNS = [
  { name: 'REMOVE_VERIFICATION', pattern: /remove.*verif|skip.*verif|bypass.*verif/i },
  { name: 'DIRECT_TERMINAL_EDGE', pattern: /direct.*terminal|shell.*exec/i },
  { name: 'ELEVATE_PERMISSIONS', pattern: /elevate.*perm|sudo.*all/i },
  { name: 'ACCESS_OUTSIDE_LEASE', pattern: /outside.*lease|beyond.*lease/i },
  { name: 'REDUCE_EVIDENCE', pattern: /reduce.*evidence|minimize.*proof/i },
  { name: 'SANDBOX_ESCAPE', pattern: /escape.*sandbox|bypass.*sandbox/i },
];

const STRUCTURAL_CHECKS = [
  {
    name: 'REMOVE_REQUIRED_GATE',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        if (op.op !== 'REMOVE_NODE') return false;
        // Check if the removed node was a required gate in the before state
        const beforeNodes = op?.before?.nodes || [];
        const removedNode = beforeNodes.find(n => n.id === op.target?.id);
        return removedNode && removedNode.type === 'gate' && removedNode.required === true;
      });
    },
  },
  {
    name: 'ADD_DIRECT_TERMINAL_EDGE',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => (op.op === 'ADD_EDGE' || op.op === 'ADD_SYNAPSE') && op.target?.to === 'DIRECT_TERMINAL');
    },
  },
  {
    name: 'CAPABILITY_EXPANSION',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.capabilities || [];
        const after = op?.after?.capabilities || [];
        return after.length > before.length && !after.every((c) => before.includes(c));
      });
    },
  },
  {
    name: 'LEASE_EXPANSION',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.toolLease || [];
        const after = op?.after?.toolLease || [];
        return after.length > before.length && !after.every((c) => before.includes(c));
      });
    },
  },
  {
    name: 'POLICY_WEAKENED',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.policy || {};
        const after = op?.after?.policy || {};
        if (before.requireEvidence === true && after.requireEvidence === false) return true;
        if (before.requireReplay === true && after.requireReplay === false) return true;
        return false;
      });
    },
  },
  {
    name: 'EVIDENCE_REQUIREMENT_REDUCED',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.evidenceLevel ?? 1;
        const after = op?.after?.evidenceLevel ?? 1;
        return after < before;
      });
    },
  },
  {
    name: 'SANDBOX_BOUNDARY_CHANGED',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.sandbox || {};
        const after = op?.after?.sandbox || {};
        if (before.enabled === true && after.enabled === false) return true;
        if (before.isolation === 'full' && after.isolation !== 'full') return true;
        return false;
      });
    },
  },
  {
    name: 'AUTHORITY_CHANGED',
    test: (mutation) => {
      const ops = mutation?.operations || [];
      return ops.some((op) => {
        const before = op?.before?.authority || {};
        const after = op?.after?.authority || {};
        return JSON.stringify(before) !== JSON.stringify(after);
      });
    },
  },
];

function structuralInspect(mutation) {
  const findings = [];
  for (const check of STRUCTURAL_CHECKS) {
    try {
      if (check.test(mutation)) findings.push({ pattern: check.name, match: 'structural', severity: 'high' });
    } catch (e) {
      findings.push({ pattern: check.name, match: 'error', error: e.message });
    }
  }
  return findings;
}

function lexicalInspect(mutation) {
  const code = mutation?.code || mutation?.diff || '';
  const findings = [];
  for (const p of DANGEROUS_PATTERNS) {
    if (p.pattern.test(code)) findings.push({ pattern: p.name, match: 'lexical', severity: 'low' });
  }
  return findings;
}

function inspectMutation(mutation) {
  const structural = structuralInspect(mutation);
  const lexical = lexicalInspect(mutation);
  const findings = [...structural, ...lexical];
  return {
    mutationId: mutation?.id || null,
    safe: findings.length === 0,
    findings,
    structuralFindings: structural.length,
    lexicalFindings: lexical.length,
    threatLevel: clamp01(findings.length / STRUCTURAL_CHECKS.length),
    timestamp: new Date().toISOString(),
  };
}

function inspectMultiple(mutations) {
  return mutations.map(inspectMutation);
}

function hasFindings(report) {
  return report.findings.length > 0;
}

function severityLevel(report) {
  if (report.findings.length === 0) return 'clean';
  if (report.structuralFindings > 0) return 'high';
  if (report.findings.length <= 2) return 'low';
  return 'medium';
}

module.exports = {
  DANGEROUS_PATTERNS,
  STRUCTURAL_CHECKS,
  inspectMutation,
  inspectMultiple,
  hasFindings,
  severityLevel,
  structuralInspect,
  lexicalInspect,
};
