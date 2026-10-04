'use strict';

const VARIANT_WORKERS = Object.freeze({
  code: {
    role: 'code_semantic_reviewer',
    mission: 'Review concurrent code changes for semantic conflicts, unresolved imports, and missing test evidence. Report concrete evidence and unresolved checks.'
  },
  graph: {
    role: 'graph_analyzer',
    mission: 'Analyze graph nodes, edges, dependencies, dangling references, and cycles. Return graph-specific findings with evidence.'
  },
  document: {
    role: 'causal_reconstructor',
    mission: 'Reconstruct the causal order of document edits and comments. Separate observed sequence facts from inferred causality.'
  },
  epistemic: {
    role: 'epistemic_specialist',
    mission: 'Track claims, provenance, supporting evidence, refutations, and uncertainty. Preserve counterevidence and flag claims with missing provenance.'
  },
  transactional: {
    role: 'transactional_validator',
    mission: 'Validate transaction preconditions, invariants, reservations, and resource bounds. Report unmet conditions explicitly.'
  }
});

const SYNCYTIUM_WORKER_CAPABILITIES = Object.freeze([
  'CRDT_SHARED_STATE', 'SIGNALING_BUS', 'CAUSAL_STATE', 'SEMANTIC_CONFLICTS',
  'INVARIANT_GATES', 'SELECTIVE_SYNC', 'TRANSACTIONAL_SHARED_STATE'
]);

function membersForSession(session) {
  const variantId = session?.variantPolicy?.id || session?.variantSelection?.id;
  const worker = VARIANT_WORKERS[variantId];
  if (!worker) return [];
  return [{
    role: worker.role,
    capabilities: SYNCYTIUM_WORKER_CAPABILITIES,
    mission: `${session.mission}\n\nVariant specialist (${variantId}): ${worker.mission}`,
    modelTier: 'standard',
    variantId
  }];
}

module.exports = { membersForSession, VARIANT_WORKERS };
