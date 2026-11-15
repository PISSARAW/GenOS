'use strict';

function morphogenesisWorkerAssignmentsStep1(context) {
if (context.Array.isArray(context.assignments) && context.mapperIndex < 0) return { value: ( context.assignments) };
}

function morphogenesisWorkerAssignmentsStep2(context) {
if (context.current.methodContract && context.methodId !== 'prompt_defined') return { value: ( context.assignments) };
}

function morphogenesisWorkerAssignmentsStep3(context) {
if (context.Array.isArray(context.assignments)) return { value: ( context.assignments.map((item, index) => index === context.mapperIndex ? context.mapper : item)) };
}

function morphogenesisWorkerAssignmentsStep4(context) {
if (context.groupTerm) context.terms.push(context.groupTerm);
}

function morphogenesisWorkerAssignmentsStep5(context) {
if (context.capacityTerm) context.terms.push(context.capacityTerm);
}

function validateBiomeAllocationStep6(context) {
if (!context.Array.isArray(context.bins) || context.bins.length !== context.facts.groups) {
    return { value: ( { passed: false, issues: ['candidate.bin_count'] }) };
  }
}

function validateBiomeAllocationStep7(context) {
if (!context.Array.isArray(context.bin) || context.bin.length === 0) {
      context.issues.push(`candidate.bin_${context.index + 1}_empty_or_invalid`);
      return { value: undefined };
    }
}

function validateBiomeAllocationStep8(context) {
if (typeof context.value === 'string') {
    try { context.value = context.JSON.parse(context.value); }
    catch (_) { return { value: ( { passed: false, issues: ['candidate.invalid_json'] }) }; }
  }
}

function validateBiomeAllocationStep9(context) {
for (const rawId of context.bin) {
      const id = context.String(rawId);
      if (!context.weights.has(id)) {
        context.issues.push(`candidate.unknown_item:${id}`);
        continue;
      }
      context.sum += context.weights.get(id);
      context.seen.push(id);
    }
}

module.exports = { morphogenesisWorkerAssignmentsStep1, morphogenesisWorkerAssignmentsStep2, morphogenesisWorkerAssignmentsStep3, morphogenesisWorkerAssignmentsStep4, morphogenesisWorkerAssignmentsStep5, validateBiomeAllocationStep6, validateBiomeAllocationStep7, validateBiomeAllocationStep8, validateBiomeAllocationStep9 };
