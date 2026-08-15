---
name: run-scientific-research
description: Version a scientific process as recursive hypotheses, executable protocols, evidence artifacts, belief updates, critiques, independent reproductions, and rewinds from suspect conclusions. Use for automated empirical research where the user needs reproducible experiments and the eliminated hypothesis space, not just a winning result.
---

# Run Scientific Research

Use `genos_scientific_experiment` from the GenOS MCP server.

## Workflow

1. State the research question, measurable outcome, baseline hypothesis, dataset boundary, and falsification criteria.
2. Require explicit protocols and deterministic implementations where possible. Separate hypotheses from observations and interpretations.
3. Use a complete `manifest`, or pass `dataset` with `research_plan`.
4. Call `genos_scientific_experiment`; use `summary` for large graphs while retaining the full report.
5. Inspect artifact hashes, protocol versions, critiques, confidence updates, reproduction consistency, rewinds, and lineage.
6. Report supported, weakened, and rejected hypotheses; contradictory reproductions; reusable methods; and the report path. Do not hide negative results.

If a conclusion is suspect, fork from the snapshot before that conclusion. Never rewrite the original scientific timeline.
