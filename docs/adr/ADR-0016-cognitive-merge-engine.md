# ADR-0016: Evidence-Based Cognitive Merge Engine

## Status
Accepted

## Context
Counterfactual branches can reach useful but contradictory conclusions. A raw
union of memories destroys provenance and can make mutually exclusive claims
appear simultaneously true. Choosing one winning branch also discards valid
discoveries made elsewhere.

## Decision
GenOS merges epistemic claims, not branch memory stores.

Each branch submits typed subject-predicate-object claims with confidence,
evidence, and branch provenance. Relations between claims are explicit:
`supports`, `contradicts`, `explains`, `supersedes`, and `qualifies`.

Branches may submit those claims inside a standard experience packet containing
conditions, observations, actions, results, created and modified beliefs,
failures, discoveries, uncertainty, and evidence. These records become typed
graph nodes; they do not become factual beliefs merely by being present.

The merge engine:

- combines identical independent claims while retaining every source;
- detects differing objects for the same subject and predicate as conflicts;
- preserves conflicts as `disputed` instead of selecting a convenient truth;
- accepts only evidenced claims meeting configured confidence and independence
  thresholds;
- records explanatory, qualifying, and superseding structure;
- distinguishes facts, hypotheses, observations, contradictions, preferences,
  results, and discoveries;
- produces connected, contextual knowledge syntheses instead of flattening
  incompatible conclusions;
- emits a reviewable merge report before changing the parent;
- applies the report to a fresh parent checkpoint as beliefs with provenance;
- never copies branch memories into the parent.

Semantic extraction from arbitrary prose is outside the merge engine. A caller
or future inference stage must turn observations into typed claims and explicit
cross-predicate relations. This boundary keeps reconciliation deterministic and
auditable.

## Consequences

- The parent may hold disputed alternatives and an accepted root-cause claim at
  the same time without contradiction being hidden.
- Every merged belief can be traced to branch evidence.
- Merge policy can be evaluated and replaced independently of claim extraction.
- Claims with weak evidence remain unresolved rather than becoming memories.
- A merge is reproducible for the same claims, relations, and configuration;
  timestamps and generated event identifiers remain execution metadata.
