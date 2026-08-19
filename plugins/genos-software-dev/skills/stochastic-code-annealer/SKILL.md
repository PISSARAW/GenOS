---
name: stochastic-code-annealer
description: Apply the "Sigma Gen 39" stochastic optimization approach to aggressively refactor codebase structures. Use massively parallel workspace mutations, simulated annealing, and adaptive causal windows to minimize cyclomatic complexity, enforce line-count constraints (<400 lines), and ensure test survival across any language.
---

# Stochastic Code Annealer

Use `genos_workspace_experiment` from the GenOS MCP server. This tool applies heuristic, non-deterministic mutations to source code, relying on massive throughput and test validation rather than deterministic semantic analysis, making it entirely language-agnostic.

## Workflow

1. **Fitness Evaluation Setup**: Establish the baseline for fitness. The fitness is boolean on correctness (all tests MUST pass) and continuous on structure (cyclomatic complexity score, file size, parameter count limits). Identify the test commands required for the target language (e.g., `npm test`, `cargo test`, `pytest`).
2. **Initial Heuristic Sweep (Radius 5)**: Create a workspace plan with large-scale, aggressive structural mutations (e.g., massive function inlining, extracting large blocks to new files, randomizing file splits).
3. **Batch Execution**: Call `genos_workspace_experiment` with the diverse hypotheses. Do not attempt to parse the AST perfectly; rely on regular expressions or text-level block swaps if necessary. Let the compiler/interpreter and the test suite act as the natural selection environment.
4. **Simulated Annealing (Reheating)**: If all branches fail the tests, or if complexity does not decrease, trigger a "thermal shock". Generate a new batch of workspaces with completely chaotic changes to escape local minima in the code architecture.
5. **Adaptive Causal Window (Radius 1)**: As the code approaches the complexity constraints and tests pass, shrink the mutation window. Focus on micro-mutations: variable renaming, removing redundant loops, flattening specific `if` conditions.
6. **Survival of the Fittest**: Select the branch that passes all tests and has the lowest structural penalty. 
7. **Return Results**: Present the optimized code diff, the number of discarded branches, and the final complexity metric. Ensure the result aligns with global AGENTS.md rules.

Do not merge the code automatically. Present the optimized branch to the user for final code review.
