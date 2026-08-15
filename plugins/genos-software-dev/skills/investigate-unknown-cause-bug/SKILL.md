---
name: investigate-unknown-cause-bug
description: Maintain several competing explanations for a software bug, test each candidate in an isolated workspace with common falsification probes, and preserve both surviving fixes and rejected hypotheses with evidence. Use when the bug's cause is unknown and the explanation space matters as much as the final patch.
---

# Investigate Unknown-Cause Bug

Use `genos_bug_investigation` from the GenOS MCP server.

## Workflow

1. Reproduce the baseline bug and capture stable evidence identifiers before editing code.
2. Create diverse, falsifiable hypotheses such as concurrency, cache, transaction, clock, numeric, configuration, and dependency causes when relevant.
3. Give every branch the same probes and explicit candidate edit. Use a complete `manifest`, or pass `repo` with `plan`.
4. Call `genos_bug_investigation`. Treat branch probes as authorized code execution in isolated worlds.
5. Require evidence for every verdict. A failed reproduction rejects only what the probe can actually falsify.
6. Report supported and rejected hypotheses, evidence records, selected fix if unique, branch diffs, lineage, uncertainty, and report path.

Never delete losing branches automatically. The final result must preserve the eliminated explanation space, not only the patch that survived.
