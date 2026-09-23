# GenOS Ablation Benchmark (Phase 3)

Measures LLM alone vs GenOS current vs Capability Resolver vs Resolver+Memory vs Full Stack across 5 scenarios with 13 metrics each.

## Arms

| Arm | Configuration |
| --- | --- |
| A | LLM alone (no GenOS) |
| B | GenOS current (baseline) |
| C | GenOS Capability Resolver |
| D | GenOS Resolver + Memory (learning service) |
| E | GenOS Resolver + Adaptive Workers (full stack) |

## Metrics

| # | Metric | Description |
| --- | --- | --- |
| 1 | taskSuccess | 1 if all tasks in scenario pass |
| 2 | tokensUsed | Total tokens consumed |
| 3 | wallClockMs | Wall-clock time in milliseconds |
| 4 | correctLocalization | 1 if right code/concept found |
| 5 | toolCalls | Number of tool invocations |
| 6 | wrongHypotheses | Incorrect approaches tried |
| 7 | repeatedInvestigation | Revisiting same code area |
| 8 | patchCorrectness | 1 if change matches ground truth |
| 9 | regressionsIntroduced | Breaking other system parts |
| 10 | daemonComputeCost | CPU/IO from GenOS daemons |
| 11 | handoffUsefulness | Usefulness of inter-component handoff |
| 12 | falseFindingRate | Fraction of incorrect findings |
| 13 | stalenessErrors | Acting on outdated knowledge |

## Scenarios

| Key | Label | Tasks | Complexity |
| --- | --- | --- | --- |
| `trivial` | Single-line fix | 1 | Minimal |
| `simple` | Locate & patch config | 2 | Low |
| `moderate` | Debug stack trace | 3 | Medium |
| `complex` | Refactor auth module | 5 | High |
| `multi-domain` | Cross-domain feature rollout | 6 | Cross-cutting |

## Usage

```bash
node benchmarks/genos-ablation/ablation-benchmark.cjs
node benchmarks/genos-ablation/ablation-benchmark.cjs --scenario=simple
node benchmarks/genos-ablation/ablation-benchmark.cjs --scenario=complex --arm=E
```

## Output

- Markdown table on stdout
- Raw results: `benchmarks/genos-ablation/results/ablation-<timestamp>.json`

## Determinism

All scenarios use fixed seeds (mulberry32 PRNG). Running the same scenario twice produces identical results. No LLM calls are made — the simulation models expected behavioral differences based on the presence or absence of GenOS subsystems.
