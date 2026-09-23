# GenOS Ablation Benchmark (Phase 3)

Measures LLM alone vs GenOS current vs Capability Resolver vs Resolver+Memory vs Full Stack across 5 scenarios with 13 metrics each.

## Arms

| Arm | Configuration |
| --- | --- |
| A | LLM alone (no GenOS) |
| B | GenOS static (fixed capabilities, fixed topology) |
| C | GenOS Capability Resolver |
| D | C + Adaptive Workers |
| E | D + Dynamic Topology |
| F | E + Relations |
| G | F + Warm ResidentDaemon |
| H | FULL MORPHOGENESIS (G + Morphology Learning) |

## Metrics

| # | Metric | Description |
| --- | --- | --- |
| 1 | taskSuccess | 1 if all tasks in scenario pass |
| 2 | verifiedSuccess | 1 if solution passes verification |
| 3 | tokensUsed | Total tokens consumed |
| 4 | latencyMs | Wall-clock time in milliseconds |
| 5 | toolCalls | Number of tool invocations |
| 6 | workersSpawned | Adaptive workers created |
| 7 | unnecessaryWorkers | Workers that added no value |
| 8 | topologySwitches | Dynamic topology changes |
| 9 | failedSwitches | Topology switches that failed |
| 10 | usefulCapabilities | Capabilities that contributed |
| 11 | missedCapabilities | Needed capabilities not found |
| 12 | wrongHypotheses | Incorrect approaches tried |
| 13 | timeToRelevantEvidence | Time to find relevant evidence |
| 14 | communicationVolume | Inter-agent message volume |
| 15 | duplicateInvestigations | Redundant investigation paths |
| 16 | daemonContribution | ResidentDaemon value-add |
| 17 | rollbackCount | Number of rollbacks needed |
| 18 | regressionCount | Regressions introduced |

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
