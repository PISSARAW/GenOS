# ADR implementation status

`Accepted` means the architectural decision is adopted. It does not mean the
decision is fully implemented. This matrix tracks executable coverage.

| ADR | Implementation | Executable coverage | Major missing work |
| --- | --- | --- | --- |
| 0008 | Partial | Genome/state separation | First-class phenotype records and divergence |
| 0009 | None | Portable schema only | Controlled cohort runner and analysis |
| 0010 | Partial | Mutation CLI and Pareto evaluator | End-to-end benchmark and selection loop |
| 0011 | Partial | Measured-trait recombination kernel | `agent breed`, genome construction, child validation |
| 0012 | None | Portable schema only | Genome claim storage, replication, promotion |
| 0013 | Partial | Confidence-bound verdict engine | Paired replay and similarity extractors |
| 0014 | Partial | Separate agent/world forks and isolation | Atomic branch capsule orchestration |
| 0015 | None | Portable schema only | Capsule store, checkpoint, restore, pause/resume |

An ADR moves to `Implemented` only when its normative behavior has production
code and proportionate tests. Schema or documentation alone counts as `None`,
not implementation.
