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
