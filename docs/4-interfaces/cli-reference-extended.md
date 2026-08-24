# GenOS CLI Reference — Extended Command Families

Companion to the [CLI reference](cli-reference.md). These command families sit above the core agent primitives: capsule lifecycle, replay and inspection, agent workflows, platform RAG primitives, the prompt registry, and evaluation datasets.

---

## 9. Capsule Lifecycle (`genos capsule`)

Runtime capsules bind a snapshot to an isolated world and a step budget.

```bash
genos capsule create --snapshot <REF> [--seed <PATH>] [--budget-steps 100]
genos capsule fork <CAPSULE_ID> --branch <LABEL=HYPOTHESIS>... [--root <PATH>]
genos capsule checkpoint <CAPSULE_ID> [--root <PATH>]
genos capsule pause <CAPSULE_ID> [--root <PATH>]
genos capsule resume <CAPSULE_ID> [--root <PATH>]
genos capsule inspect <CAPSULE_ID> [--root <PATH>]
```

---

## 10. Replay & Inspection (`genos replay`, `genos inspect`)

Deterministic state reconstruction from the append-only event stream, plus typed entity inspection.

```bash
# Replay a branch (or the branch owned by a snapshot) with optional assertions
genos replay basic [--branch-id <ID>|--snapshot <REF>] \
  [--expect-agent-id <ID>] [--expect-branch-id <ID>] [--expect-last-sequence <N>] \
  [--format json|yaml]

# Rebuild state from a stored snapshot id
genos replay from-snapshot --snapshot-id <ID> [--format json|yaml]

# Render a belief's provenance tree: belief -> evidence tool outputs -> events
genos inspect belief --snapshot <REF> --belief-id <BELIEF_ID> \
  [--events <PATH>] [--format text|json|yaml]
```

---

## 11. Agent Workflows (`genos workflow`)

Configurable agent graphs with streaming events and human-in-the-loop approvals.

```bash
genos workflow init [--output workflow.yaml]
genos workflow validate <MANIFEST>
genos workflow run <MANIFEST> [--input <JSON>] [--auto-approve]
genos workflow resume <RUN_DIR> --decision approve|reject|<JSON_VALUE>
genos workflow package <MANIFEST> [--output workflow.genos-package.json]
```

`playground` is an alias of `run` for repeated stdin-driven executions.

---

## 12. Platform Primitives: RAG (`genos platform`)

Local retrieval-augmented generation primitives over a portable index file.

```bash
genos platform ingest <DOCUMENT> [--index .genos/platform-index.json] [--chunk-size 800] [--overlap 120]
genos platform search <QUERY> [--index .genos/platform-index.json] [--limit 5]
genos platform status
```

---

## 13. Prompt Registry (`genos prompt`)

Versioned prompt templates with dynamic context rendering.

```bash
genos prompt publish <NAME> <TEMPLATE> [--label L1,L2] [--registry .genos/prompts.json]
genos prompt render <NAME> [--version <N>] [--var KEY=VALUE]... [--registry .genos/prompts.json]
genos prompt diff <NAME> --left <N> --right <N> [--registry .genos/prompts.json]
```

---

## 14. Evaluation Datasets (`genos eval`)

Persistent evaluation datasets and batch scoring.

```bash
genos eval import <INPUT> --output <DATASET_PATH>
genos eval run <DATASET> --responses <PATH> [--output <REPORT_PATH>]
genos eval parasitism <INPUT> --output <PATH> [--evolve]
```

---

## Appendix: Hallucination `detect` Output

Finding kinds: `missing_receipt`, `unverified_execution`, `ungrounded_belief`, `weak_evidence`.

```json
{
  "source": "snap.json",
  "tool_output_count": 2,
  "belief_count": 1,
  "finding_count": 1,
  "findings": [
    {
      "kind": "ungrounded_belief",
      "subject": "<belief-id>",
      "detail": "belief 'weather injected_premise rain' carries no evidence"
    }
  ]
}
```
