---
name: genos-development
description: Use GenOS throughout coding tasks to retrieve failure memories, inspect supplied hypotheses, checkpoint changes and preserve decisions and test evidence. Applies to code changes when the GenOS MCP server is connected.
---

# GenOS Development

Use the connected GenOS MCP tools at meaningful development boundaries.

1. Discover the tool schemas. Keep the real agent, workspace and tenant identity.
2. Retrieve prior failures with `genos_search_failures`. For a bug, formulate falsifiable hypotheses and pass them to `genos_diagnose` with the task and observed error.
3. Before risky edits, use `genos_snapshot` with a real agent input and a workspace-relative output. Verify that the snapshot was written; the CLI must be installed.
4. Make the authorized edits and run executable probes in the authorized workspace. Keep the exact diff, revision, commands and results as evidence references.
5. Persist significant decisions using `genos_record_decision`, with agentId, title, decision, evidence, alternatives and assumptions. Record reusable outcomes using `genos_record_experience`.
6. Before compaction or handoff, call `genos_compile_memory` with facts, decisions, failures and source_refs.

For an authorized isolated mission, use `genos_orchestrate` with an explicit executor. `executor: "codex"` launches a separate runtime; `caller_mcp` requires host Sampling. Bound cost and time. Do not launch a parallel mission for a trivial edit.

Check `isError`, `success`, status and persisted identifiers. A memory write is not verification or permission to promote. If GenOS is disconnected, report it and do not claim GenOS coverage. These instructions encourage consistent use; they do not enforce every native edit through GenOS.
