---
pretty_name: GenOS AgentBench
license: apache-2.0
task_categories:
  - text-generation
  - reinforcement-learning
language:
  - en
tags:
  - coding-agents
  - model-context-protocol
  - agent-evaluation
  - codex
  - genos
size_categories:
  - n<1K
---

# GenOS AgentBench

GenOS AgentBench evaluates whether adding the GenOS MCP workflow improves
coding-agent outcomes on stateful software-repair tasks. The primary metric is
post-run functional test pass rate; efficiency and MCP usage are secondary.

## Dataset structure

- `data/tasks.jsonl`: task prompts, starter implementations, and public tests;
- `data/pilot-results.jsonl`: per-run metadata from the committed pilot;
- graders, runner, raw traces, and statistical report live in the linked GitHub
  repository so every score can be reproduced.

## Experimental design

Each model-task-repetition tuple is paired across `standard` and `genos`
conditions. Model, reasoning effort, prompt, sandbox and output schema are held
constant. The GenOS arm adds only the local GenOS MCP server. Grading occurs
after agent exit. The publication profile uses all visible Codex models, all
three tasks, and at least three repetitions.

## Pilot result

The initial integration pilot contains one GPT-5.4 Mini pair on `lease-ledger`.
Both conditions passed 8/8 functional checks. GenOS invoked four MCP tools and
therefore demonstrated active integration, but the single pair provides no
evidence of superiority. Consult `publication_gate` before citing results.

## Limitations

The tasks are synthetic and emphasize state-machine correctness. They do not
represent all repositories, languages, or agent workloads. Model inference is
stochastic; publish raw samples and paired confidence intervals with any claim.
