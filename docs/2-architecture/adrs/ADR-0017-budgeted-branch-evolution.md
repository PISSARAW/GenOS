# ADR-0017: Budgeted Temporary Branch Evolution

## Status
Accepted

## Context
Counterfactual search becomes wasteful when every branch receives equal compute
regardless of intermediate quality. It also remains shallow when branches cannot
split recursively after discovering a promising direction.

## Decision
GenOS schedules reasoning branches under a finite global compute budget.

Every active branch receives a minimum evaluation allocation and a bounded score
in `[0, 1]`. A branch dies when its score falls below the survival threshold or
when a configured generation capacity is assigned to stronger alternatives.
Death is explicit and auditable; descendants of a dead branch are not launched.
For live agent-world capsules, death first creates a durable checkpoint, then
marks the capsule `cancelled` or `budget_exhausted` and destroys its live world.

Surviving branches may split recursively up to configured depth and fan-out
limits. Descendant evaluation allocation is weighted by the parent's score. The
final unspent budget is distributed across living leaves in proportion to their
own scores, separating fair evaluation from exploitation.

The scheduler must never exceed the global budget. A branch that cannot receive
the minimum evaluation allocation is marked `budget_exhausted`, not silently
discarded. Eliminated branches and their consumed compute remain in the report.

Scores are provided by an evaluator outside the scheduler. This keeps allocation
policy deterministic and allows experiments to compare different scoring
functions without changing branch lifecycle semantics.

## Consequences

- Weak reasoning paths stop consuming compute early.
- Promising paths can create temporary descendants and receive more resources.
- Search depth, fan-out, survivor count, and total cost remain bounded.
- A high score is a search signal, not a truth claim; surviving knowledge still
  passes through the Cognitive Merge Engine.
- Results are reproducible for the same tree, scores, configuration, and budget.
