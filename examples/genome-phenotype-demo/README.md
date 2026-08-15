# Same genome, different phenotype demo

Two agents can share the same genome hash while carrying different branch-local
memories:

```text
same genome
different phenotype/state
```

Run the deterministic invariant test:

```powershell
cargo test -p genos-core same_genome_can_have_different_phenotype_state
```

For a longitudinal experiment, create all sibling clones from the same
baseline snapshot, verify that their genome digests and logical baseline diffs
match, and assign a distinct treatment to each clone. Evaluate every clone on
the same suite at fixed checkpoints. See
`spec/heredity-experiment.schema.json` for the portable experiment record.
