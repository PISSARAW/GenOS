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

function recoveryFailureReason(reason, diagnostics, evidenceReport, priorFailure) {
  const base = String(reason || 'Worker did not produce a verified answer.');
  if (diagnostics?.code !== 'BIOME_ALLOCATION_INVALID') {
    const unresolved = evidenceReport?.outcome === 'unresolved'
      ? (evidenceReport.uncertainties || []).map(String).slice(0, 4).join(' ') : '';
    const prior = String(priorFailure || '').trim();
    return [unresolved ? `Prior unresolved model claim: ${unresolved}` : base,
      prior ? `Prior validator feedback: ${prior}` : ''].filter(Boolean).join(' ').slice(0, 4000);
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
    const issues = feedback;
    const repair = /candidate\.invalid_json/.test(issues)
      ? 'Repair only the JSON shape: return exactly the requested number of nested arrays and quote every item ID as a JSON string.'
      : /candidate\.bin_\d+_over_capacity/.test(issues)
        ? 'Recalculate each bin sum, then make the smallest valid repair by moving an item from an over-capacity bin into another bin with enough remaining capacity; backtrack if no move works. Keep all bins non-empty and preserve exact item coverage.'
        : 'Recalculate every bin and repair the reported constraint while preserving exact item coverage.';
    return ` Repair the previous candidate using this runtime feedback: ${feedback.slice(0, 1800)}. ${repair} Verify every bin and item before returning the corrected candidate.`;
  }
  if (/candidate\.bin_\d+_over_capacity|over capacity|over-capacity/i.test(feedback)) {
    return ` Previous attempt exceeded a bin capacity (${feedback.slice(0, 300)}). Recalculate each bin and make the smallest repair by moving item(s) from overfull bins into bins with sufficient remaining capacity; keep all bins non-empty, preserve exact item coverage, and verify every total.`;
  }
  if (/Prior unresolved model claim:|impossible|not possible|cannot be done/i.test(feedback)) {
    return ` Previous impossibility claim was unverified (${feedback.slice(0, 120)}). Retry the exhaustive search above; return unresolved only if it proves no solution.`;
  }
  return '';
}

module.exports = { allocationFailure, recoveryFailureReason, recoveryInstruction };
