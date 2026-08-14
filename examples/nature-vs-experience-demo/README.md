# Nature vs experience demo

Before any experiment runs, two agents may differ genetically while sharing an
identical state:

```text
Genome A: exploration = 0.4
Genome B: exploration = 0.9
same phenotype/state
```

Run the deterministic invariant test:

```powershell
cargo test -p genos-core different_genomes_can_start_with_identical_phenotype_state
```
