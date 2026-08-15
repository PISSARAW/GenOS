# Agent Genome + Counterfactual OS cycle

The executable integration test constructs generation 124 of
`agent://bruney-ai`, forks A/B/C into isolated directory worlds, collects typed
experience packets, terminates those worlds, performs cognitive merge, and
persists S1:

```powershell
cargo test -p genos-runtime genome_os::tests::complete_generation_checkpoints_forks_merges_and_checkpoints_again
```

The public orchestration API is `run_genome_os_cycle`. A production caller
supplies a `CounterfactualExperienceRunner` that operates each live capsule and
returns an experience whose branch id must match that capsule's lineage id.
