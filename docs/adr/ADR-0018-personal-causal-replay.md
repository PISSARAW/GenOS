# ADR-0018: Personal Causal Replay from a Historical Checkpoint

## Status
Accepted

## Context
Restoring an old agent snapshot answers what the agent knew then, but not what
would have happened if one historical decision had changed. A useful temporal
fork must preserve the factual timeline, replace one intervention point, replay
the future that remains available, and explain why the resulting present
diverges.

## Decision
GenOS models personal causal replay as two immutable timelines originating from
one dated checkpoint:

- `reality` replays the recorded decision and subsequent events;
- `counterfactual` replaces exactly one decision at the same timestamp and
  replays the same available event stream.

Events declare causal dependencies, state preconditions, and typed state
effects. An event whose dependencies or preconditions no longer hold is marked
`skipped` and remains visible as causally incompatible. Events may also remain
available while applying different conditional effects in the new state.

The report compares final state, direct intervention effects, downstream
effects, incompatible events, and events replayed in both worlds. Neither
timeline overwrites the other, and counterfactual results are simulations rather
than observations.

Replay is deterministic for the same checkpoint, ordered events, intervention,
and effect model. Dependencies must reference earlier events, event identifiers
must be unique, and the replacement must be a new decision at the timestamp of
the original decision.

## Consequences

- A six-month-old agent can be forked conceptually at a March checkpoint and
  compared with its factual August state.
- April′ and May′ can differ because event effects are state-dependent or events
  become incompatible.
- Causal assumptions are explicit, inspectable, and replaceable.
- Connecting arbitrary historical agent events to domain-specific state effects
  remains an adapter responsibility rather than hidden model inference.
