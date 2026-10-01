---
name: compare-code-fixes
description: Fork a real repository into isolated candidate fixes, execute each branch's tests, retain diffs and artifacts, score outcomes, and explain the selected branch. Use for small or medium code bugs when the user wants several concrete fixes compared rather than one speculative patch.
---

# Compare Code Fixes

This skill uses a GenOS mission through `genos_orchestrate`; it has no dedicated single-call MCP operation.

1. Describe the requested compare code fixes task, source workspace, constraints, budget and required executable evidence.
2. Inspect the discovered `genos_orchestrate` schema. Explicitly set `executor: "codex"` for a Codex host without native Sampling; this launches a separate Codex runtime. Set `background: false` and bound the budget.
3. Pass the complete task as `mission` and the source workspace as `workspaceRoot`. For review or analysis, keep file edits disabled.
4. Check mission status and evidence. Request isolated alternatives only when required by the task. Do not treat orchestration transport success as task completion.
5. Return identifiers, actual artifacts, measured evidence and unresolved requirements. The mission may remain blocked or unverified.

If the MCP tools are unavailable, report that limitation; never replace a missing call with a fabricated result. Preserve leases, sandbox boundaries and evidence gates.
