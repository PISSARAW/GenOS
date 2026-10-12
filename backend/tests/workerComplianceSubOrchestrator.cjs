'use strict';

function method() {
  const procedure = { version: 1, methodId: 'subset_sum', parameters: { values: [3, 5, 7], target: 10 } };
  return { version: 1, methodId: 'coordinate_children', parameters: { children: [
    { workerKind: 'bounded_worker', mission: 'Solve the delegated subset-sum fixture.',
      methodContract: { version: 1, methodId: 'scoped_procedure', parameters: { procedure } } },
    { workerKind: 'scout_cell', mission: 'Find the delegated literal in the sealed fixture.',
      methodContract: { version: 1, methodId: 'scan_literal', parameters: {
        sources: [{ sourceRef: 'corpus://delegation/fixture', text: 'worker=completed' }], terms: ['completed']
      } } }
  ] } };
}

function enabled(kind) {
  return kind === 'sub_orchestrator' && process.env.GENOS_COMPLIANCE_DETERMINISTIC_SUBORCH === '1';
}

function references(content) {
  const children = content?.childSummaries || [];
  const refs = children.flatMap((child) => child.evidence || []);
  const claimRefs = content?.claims?.[0]?.evidence || [];
  return validChildren(children) && hasExpectedRefs(refs, content)
    && refs.every((ref) => claimRefs.includes(ref)) && claimRefs.includes(content?.coordinationReceipt?.id);
}

function validChildren(children) {
  return children.length === 2 && children.every((child) => child.outcome === 'success');
}

function hasExpectedRefs(refs, content) {
  return refs.some(isSolverRef) && refs.includes('corpus://delegation/fixture')
    && isSolverRef(content?.coordinationReceipt?.id || '');
}

function isSolverRef(value) { return /^solver:\/\/sha256:[a-f0-9]{64}$/.test(value); }

module.exports = { method, references, enabled };
