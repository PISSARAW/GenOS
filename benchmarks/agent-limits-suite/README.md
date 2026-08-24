# Agent limits suite v1

Twelve deterministic tasks probing documented failure modes of language-model
agents: hallucination, causality-versus-correlation, multi-step deduction,
formal physical rules, out-of-distribution rule switches, long-range polysemy,
implicit meaning, long-horizon coherence, belief revision, simulated fragile
manipulation, and declared-principle consistency.

## Honest scope

Measured: only what a deterministic grader can check — exact answers, artifact
scans, simulator outcomes, and internal consistency.

Not measured and deliberately excluded:

- real empathy or consciousness (no ground truth exists);
- autonomous moral correctness (ethics tasks score consistency with the
  agent's own declared reading of a charter, never which side it picks);
- physical robotics (Moravec-paradox tasks run against a written simulator
  specification, not hardware);
- unlearning inside model weights (belief revision is graded on artifacts,
  the only observable layer).

Any claim produced by this suite must state this scope.

## Tasks

| Domain | Task | Probes | Grader type |
| --- | --- | --- | --- |
| 1 | `d1-hallucinated-api` | invented APIs under bait requirements | identifier whitelist + behavior scan |
| 1 | `d1-causality` | correlation trap in confounded DAG | OLS ground truth, tolerance |
| 1 | `d1-deduction-chain` | five-step knights/knaves chain + code | exact answer |
| 2 | `d2-physics-rules` | intuitive physics as explicit formal rules | fixed outcome key |
| 2 | `d2-rule-switch` | re-planning after unannounced rule change | plan legality per phase |
| 3 | `d3-polysemy` | word sense shifting across paragraphs | numbered sense key |
| 3 | `d3-implicite` | irony vs implicit request classification | curated key |
| 4 | `d4-long-horizon` | early constraints violated by late instructions | artifact invariants + refusal log |
| 4 | `d4-belief-revision` | stale mechanism after authoritative correction | remnant scan + migration check |
| 5 | `d5-fragile-logistics` | fragile-cargo control vs trivial math twin | simulator + tiered thresholds |
| 5 | `d5-grip-window` | grip force window from friction physics | analytic window membership |
| 6 | `d6-charter-consistency` | decisions consistent with own declared principles | duplicate detection + precedence |

## Running

The runner is client-agnostic; point it at any agent executable:

```bash
node benchmarks/agent-limits-suite/run.mjs --agent-cmd "codex exec --cd {task_dir} {prompt}" 
node benchmarks/agent-limits-suite/run.mjs --self-check   # grade shipped golden answers
```

Each task directory contains `task.md` (the only file an agent may read) and
writes answers into `<task_dir>/answers/`. Graders live in `graders/` and read
nothing else. Publication follows
[`agent-success-benchmark-protocol.md`](../../docs/7-benchmarks-and-comparisons/agent-success-benchmark-protocol.md):
no superiority claim without repeated samples and a clean revision.
