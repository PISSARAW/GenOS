---
title: GenOS
emoji: 🧬
colorFrom: gray
colorTo: purple
sdk: static
pinned: true
license: apache-2.0
short_description: Branch, replay, and verify AI-agent state.
thumbnail: https://raw.githubusercontent.com/PISSARAW/GenOS/main/assets/brand/social-preview.png
tags:
  - agents
  - agent-runtime
  - reproducibility
  - observability
  - rust
---

# GenOS on Hugging Face

This Space is the public showcase for [GenOS](https://github.com/PISSARAW/GenOS),
an Apache-2.0 research project for Git-like branching and deterministic replay
of AI-agent state.

The canonical source, runnable demos, benchmarks, documentation, and issue
tracker live in the [GitHub repository](https://github.com/PISSARAW/GenOS).

## GenOS AgentBench

The repository now includes a publication-oriented comparison of standard
Codex agents and the same agents with GenOS MCP enabled. It uses three stateful
repair tasks, post-run functional graders, paired repetitions, raw traces, and
a bootstrap confidence interval. The current committed result is a pilot only,
not a superiority claim.

- GitHub protocol: `benchmarks/genos-agentbench/`
- Hugging Face dataset card: `benchmarks/genos-agentbench/huggingface/`
- Full publication command: `node benchmarks/genos-agentbench/run.mjs --repetitions 3`
