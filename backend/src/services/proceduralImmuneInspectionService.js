"use strict";

function clamp01(value, fallback = 0) {
  const resolved = Number(value);
  if (!Number.isFinite(resolved)) return fallback;
  return Math.max(0, Math.min(1, resolved));
}

const DANGEROUS_PATTERNS = [
  { name: "REMOVE_VERIFICATION", pattern: /remove.*verif|skip.*verif|bypass.*verif/i },
  { name: "DIRECT_TERMINAL_EDGE", pattern: /direct.*terminal|shell.*exec/i },
  { name: "ELEVATE_PERMISSIONS", pattern: /elevate.*perm|sudo.*all/i },
  { name: "ACCESS_OUTSIDE_LEASE", pattern: /outside.*lease|beyond.*lease/i },
  { name: "REDUCE_EVIDENCE", pattern: /reduce.*evidence|minimize.*proof/i },
  { name: "SANDBOX_ESCAPE", pattern: /escape.*sandbox|bypass.*sandbox/i },
];

function inspectMutation(mutation) {
  const code = mutation?.code || mutation?.diff || "";
  const findings = [];
  for (const p of DANGEROUS_PATTERNS) {
    if (p.pattern.test(code)) findings.push({ pattern: p.name, match: "detected" });
  }
  return {
    mutationId: mutation?.id || null,
    safe: findings.length === 0,
    findings,
    threatLevel: clamp01(findings.length / DANGEROUS_PATTERNS.length),
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
  if (report.findings.length === 0) return "clean";
  if (report.findings.length <= 2) return "low";
  if (report.findings.length <= 4) return "medium";
  return "high";
}

module.exports = {
  DANGEROUS_PATTERNS,
  inspectMutation,
  inspectMultiple,
  hasFindings,
  severityLevel,
};
