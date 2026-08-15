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

Knowledge synthesis extracts evidence-bearing findings from several branches
into a proposal. The proposal is tested on a fresh validation branch before it
can affect an active agent. This is not a raw merge of memories or files.

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

GenOS currently implements real agent-snapshot forks and isolated world forks.
The workspace experiment runner exercises isolated worlds, while the agent fork
CLI exercises cloned agent snapshots. Binding both into one atomic branch
capsule is the next orchestration milestone required for the complete
Counterfactual OS contract.
