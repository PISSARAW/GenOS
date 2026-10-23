'use strict';

function allocationFailure(candidate, issues) {
  let serialized;
  try { serialized = typeof candidate === 'string' ? candidate : JSON.stringify(candidate); }
  catch (_) { serialized = ''; }
  const failures = Array.isArray(issues) ? issues.map(String).slice(0, 32) : [];
  return Object.assign(new Error(`Biome mutated output violates allocation constraints: ${failures.join(', ')}.`), {
    code: 'WORKER_OUTPUT_CONSTRAINT_VIOLATION',
    workerArtifactDiagnostics: {
      code: 'BIOME_ALLOCATION_INVALID', candidate: String(serialized || '').slice(0, 1200), issues: failures
    }
  });
}

function recoveryFailureReason(reason, diagnostics, evidenceReport) {
  const base = String(reason || 'Worker did not produce a verified answer.');
  if (diagnostics?.code !== 'BIOME_ALLOCATION_INVALID') {
    const unresolved = evidenceReport?.outcome === 'unresolved'
      ? (evidenceReport.uncertainties || []).map(String).slice(0, 4).join(' ') : '';
    return unresolved ? `${base} Prior unresolved model claim: ${unresolved}`.slice(0, 4000) : base;
  }
  const candidate = String(diagnostics.candidate || '').slice(0, 1200);
  const issues = Array.isArray(diagnostics.issues) ? diagnostics.issues.map(String).slice(0, 32).join(', ') : '';
  return `${base} Rejected Biome candidate: ${candidate}. Validator issues: ${issues}.`.slice(0, 4000);
}

function recoveryInstruction(mission) {
  const source = String(mission || '');
  const feedback = source.match(/\nPrevious failure:\s*([^\r\n]+)/i)?.[1];
  if (!feedback) return '';
  if (/Rejected Biome candidate:|Validator issues:/i.test(feedback)) {
    return ` Repair the previous candidate using this runtime feedback: ${feedback.slice(0, 1800)}. Recalculate every bin and verify exact item coverage before returning the corrected candidate.`;
  }
  if (/Prior unresolved model claim:|impossible|not possible|cannot be done/i.test(feedback)) {
    return ` The previous attempt returned an unverified impossibility claim: ${feedback.slice(0, 1200)}. Do not repeat that claim without an exhaustive search. Use exact backtracking: sort remaining item weights descending, place each into a bin with enough remaining capacity, skip bins with equal remaining capacity, and backtrack after dead ends. Only return unresolved after exhausting all partitions; verify every returned bin and every item.`;
  }
  return '';
}

module.exports = { allocationFailure, recoveryFailureReason, recoveryInstruction };
