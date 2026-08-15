---
name: compare-code-fixes
description: Fork a real repository into isolated candidate fixes, execute each branch's tests, retain diffs and artifacts, score outcomes, and explain the selected branch. Use for small or medium code bugs when the user wants several concrete fixes compared rather than one speculative patch.
---

# Compare Code Fixes

Use `genos_workspace_experiment` from the GenOS MCP server.

## Workflow

1. Identify the repository, bug, candidate strategies, verification commands, and evaluation criteria.
2. Use a complete `manifest`, or pass `repo` with a reusable `plan`. Never mix the two modes.
3. Keep one falsifiable hypothesis per branch. Require every branch to run relevant tests and produce a diff.
4. Call `genos_workspace_experiment`. Treat it as code execution in isolated workspaces and do not add commands the user did not authorize.
5. Compare verification status, score dimensions, changed files, and rejected hypotheses. Do not infer success from a zero diff or a score alone.
6. Report the selected branch, evidence, report path, and lineage. Keep losing branches inspectable; do not merge them automatically.

For a minimal public case, model alternatives such as exception handling, a result type, and input validation against the same failing test.
