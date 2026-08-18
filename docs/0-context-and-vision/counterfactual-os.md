# Counterfactual OS

Counterfactual OS turns one decision into several isolated executions. Given a
root agent snapshot `S0`, it creates sibling branch capsules that share an
ancestor but not mutable state:

```text
                              S0
                               |
              +----------------+----------------+
              |                |                |
        PostgreSQL         New database        Hybrid
          agent A             agent B           agent C
          world A             world B           world C
          events A            events B          events C
              |                |                |
              +---------- evaluation -----------+
                               |
                    select or synthesize
```

The isolation boundary includes the agent snapshot, world, memory writes,
belief updates, tool outputs, event stream, permissions, and budget. A branch
can fail or exhaust its budget without contaminating a sibling.

## Resolution

Selection continues from one complete branch and preserves all others for
inspection or later resumption.

The Cognitive Merge Engine converts branch experience packets into a typed
knowledge graph. It preserves contextual contradictions, evidence, uncertainty,
and provenance before applying reviewed beliefs to a fresh parent checkpoint.
This is not a raw merge of memories or files.

## Integrated generation cycle

```text
Agent Genome -> Runtime -> checkpoint S0
                              |
                    counterfactual fork
                    /         |         \
              agent+world A  B  agent+world C
                    \         |         /
                       experience packets
                              |
                       cognitive merge
                              |
                         checkpoint S1
```

Forks carry stable lineage addresses such as
`agent://bruney-ai/generation/124/fork/124-A`. Temporary worlds are checkpointed
and destroyed after their experience is collected. S1 keeps the checkpointed
parent world and receives the merged agent state.

## The versioned object

Git versions a filesystem tree. Counterfactual OS versions an agent-world
capsule:

```text
Git commit                  Counterfactual checkpoint
-----------                 --------------------------
tree digest                 genome + agent state
parent commits              world snapshot
author/message              runtime + tools + permissions
                            processes + services
                            event cursor + budget
                            lineage + integrity
```

A branch may run for an extended period and emit many capsule checkpoints.
Filesystem content is normally snapshotted. Processes and virtual environments
are either restored from compatible runtime checkpoints or reconstructed from
pinned manifests. External services must be explicitly forked, simulated,
pinned, or marked nondeterministic.

## Current implementation boundary

GenOS implements the complete local S0-to-S1 orchestration cycle, including
agent-world checkpointing, lineaged isolated forks, experience collection,
temporary-world termination, cognitive merge, and the final merge capsule.
Cross-machine atomicity and distributed rollback remain future infrastructure.
