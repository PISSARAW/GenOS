# GenOS Arena

Arena executes paired model-alone, full-GenOS, and ablation runs through an
explicit adapter. It requires at least three repetitions per task. Randomized
arm order, a shared seed and state digest, and adapter-reported model, harness,
parameter, and budget identities are recorded for every task block. A changed
identity aborts the run rather than mixing incomparable observations.

The six ablations remove Morphogenesis, verification, daemons, memory,
counterfactuals, or topology composition. The adapter must implement each arm
and return raw output, measured metrics, and a verification receipt containing
a verifier identity, digest, method, result, and evidence. Runs without a
complete receipt are retained as unverified and excluded from measured counts.
Missing metrics remain `null`.

Copy `suite.example.json`, replace its task with one backed by an independent
oracle, and provide a local CommonJS adapter exporting `executeCase(request)`.
The request includes `arm`, `removedFeatures`, task, seed, budget, allowed
tools, and state digest. Example invocation:

```sh
npm run arena -- benchmarks/genos-arena/suite.json ./my-arena-adapter.cjs arena-result.json
```

No live adapter or confirmatory task set is bundled, so this repository does
not claim benchmark scores. Planned domain families: code, mathematics,
constraints, research, planning, repository analysis, recovery, long horizon,
memory, and adversarial tasks. See the common controls in
[`../README.md`](../README.md) and ADR 0035.
