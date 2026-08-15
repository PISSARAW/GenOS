# Architecture decision records

Architecture Decision Records capture durable choices and their consequences. `Accepted` means the project has adopted a decision; it does not guarantee complete implementation. Consult [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for executable coverage.

| ADR | Decision |
| --- | --- |
| [0001](ADR-0001-genome-state-separation.md) | Separate genome and state |
| [0002](ADR-0002-event-sourcing.md) | Use event sourcing for historical truth |
| [0003](ADR-0003-world-separation.md) | Separate the world from the agent |
| [0004](ADR-0004-fork-isolation.md) | Define fork isolation semantics |
| [0005](ADR-0005-state-vs-execution-replay.md) | Distinguish state replay from execution replay |
| [0006](ADR-0006-provider-neutrality.md) | Require provider neutrality |
| [0007](ADR-0007-cognitive-merge-deferred.md) | Defer cognitive merge in V0 |
| [0008](ADR-0008-genotype-phenotype-state.md) | Distinguish genotype, phenotype, and state |
| [0009](ADR-0009-heredity-experiments.md) | Model heredity as controlled cohorts |
| [0010](ADR-0010-artificial-selection.md) | Preserve populations during artificial selection |
| [0011](ADR-0011-evidence-based-breeding.md) | Breed from measured traits |
| [0012](ADR-0012-inferred-genomic-traits.md) | Store discovered traits as inferred claims |
| [0013](ADR-0013-functional-reproducibility.md) | Define functional reproducibility |
| [0014](ADR-0014-counterfactual-os-execution.md) | Execute counterfactual branches as isolated agents |
| [0015](ADR-0015-agent-world-capsules.md) | Version agent-world capsules |
| [0016](ADR-0016-cognitive-merge-engine.md) | Merge evidence-based knowledge explicitly |
| [0017](ADR-0017-budgeted-branch-evolution.md) | Evolve temporary branches under a budget |
| [0018](ADR-0018-personal-causal-replay.md) | Replay from historical personal checkpoints |
| [0019](ADR-0019-agent-genome-counterfactual-cycle.md) | Integrate genome evolution and counterfactual execution |
| [0020](ADR-0020-agent-primitives-cli.md) | Define canonical agent CLI primitives |
| [0021](ADR-0021-protocol-interoperability-codex.md) | Expose provider-neutral protocols to OpenAI Codex and other agent environments |

## Adding an ADR

Use the next sequential number. Include status, context, decision, and consequences. Link the ADR from this index and update implementation status only after production code and proportionate tests exist.
