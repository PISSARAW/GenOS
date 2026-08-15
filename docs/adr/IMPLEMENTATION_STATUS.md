# ADR implementation status

`Accepted` means the architectural decision is adopted. It does not mean the
decision is fully implemented. This matrix tracks executable coverage.

| ADR | Implementation | Executable coverage | Major missing work |
| --- | --- | --- | --- |
| 0008 | Implemented | First-class phenotype records and divergence | — |
| 0009 | Implemented | Controlled cohorts and factorial interaction analysis | — |
| 0010 | Implemented | Mutation, controlled metrics, constraints, Pareto selection | — |
| 0011 | Implemented | `agent breed`, two-parent lineage, child validation | — |
| 0012 | Implemented | Claim storage, replication, heritability, promotion | — |
| 0013 | Implemented | Paired execution, similarity extraction, equivalence verdict | — |
| 0014 | Implemented | Atomic agent-world forks and validated synthesis | — |
| 0015 | Implemented | Capsule store, integrity, checkpoint, pause/resume, restoration | — |

An ADR moves to `Implemented` only when its normative behavior has production
code and proportionate tests. Schema or documentation alone counts as `None`,
not implementation.
