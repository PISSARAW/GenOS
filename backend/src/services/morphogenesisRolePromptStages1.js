'use strict';

function morphogenesisWorkerAssignmentsStage1(__genosStageScope1) {
if (__genosStageScope1.Array.isArray(__genosStageScope1.assignments) && __genosStageScope1.mapperIndex < 0) return { value: ( __genosStageScope1.assignments) };
}

function morphogenesisWorkerAssignmentsStage2(__genosStageScope2) {
if (__genosStageScope2.current.methodContract && __genosStageScope2.methodId !== 'prompt_defined') return { value: ( __genosStageScope2.assignments) };
}

function morphogenesisWorkerAssignmentsStage3(__genosStageScope3) {
if (__genosStageScope3.Array.isArray(__genosStageScope3.assignments)) return { value: ( __genosStageScope3.assignments.map((item, index) => index === __genosStageScope3.mapperIndex ? __genosStageScope3.mapper : item)) };
}

function morphogenesisWorkerAssignmentsStage4(__genosStageScope4) {
if (__genosStageScope4.groupTerm) __genosStageScope4.terms.push(__genosStageScope4.groupTerm);
}

function morphogenesisWorkerAssignmentsStage5(__genosStageScope5) {
if (__genosStageScope5.capacityTerm) __genosStageScope5.terms.push(__genosStageScope5.capacityTerm);
}

function validateBiomeAllocationStage6(__genosStageScope6) {
if (!__genosStageScope6.Array.isArray(__genosStageScope6.bins) || __genosStageScope6.bins.length !== __genosStageScope6.facts.groups) {
    return { value: ( { passed: false, issues: ['candidate.bin_count'] }) };
  }
}

function validateBiomeAllocationStage7(__genosStageScope7) {
if (!__genosStageScope7.Array.isArray(__genosStageScope7.bin) || __genosStageScope7.bin.length === 0) {
      __genosStageScope7.issues.push(`candidate.bin_${__genosStageScope7.index + 1}_empty_or_invalid`);
      return { value: undefined };
    }
}

function validateBiomeAllocationStage8(__genosStageScope8) {
if (typeof __genosStageScope8.value === 'string') {
    try { __genosStageScope8.value = __genosStageScope8.JSON.parse(__genosStageScope8.value); }
    catch (_) { return { value: ( { passed: false, issues: ['candidate.invalid_json'] }) }; }
  }
}

function validateBiomeAllocationStage9(__genosStageScope9) {
for (const rawId of __genosStageScope9.bin) {
      const id = (0, __genosStageScope9.String)(rawId);
      if (!__genosStageScope9.weights.has(id)) {
        __genosStageScope9.issues.push(`candidate.unknown_item:${id}`);
        continue;
      }
      __genosStageScope9.sum += __genosStageScope9.weights.get(id);
      __genosStageScope9.seen.push(id);
    }
}

module.exports = { morphogenesisWorkerAssignmentsStage1, morphogenesisWorkerAssignmentsStage2, morphogenesisWorkerAssignmentsStage3, morphogenesisWorkerAssignmentsStage4, morphogenesisWorkerAssignmentsStage5, validateBiomeAllocationStage6, validateBiomeAllocationStage7, validateBiomeAllocationStage8, validateBiomeAllocationStage9 };
