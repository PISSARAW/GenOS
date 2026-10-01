---
name: genos-compile-memory
description: Condense development context into durable facts, decisions, failures, constraints, questions, and sources. Use before handoff or context loss.
---

# GenOS Compile Memory

Use `genos_compile_memory` with its discovered schema and caller-supplied inputs. Read the tool description for its actual scope.

1. Inspect the MCP schema; preserve agent and tenant identity.
2. Collect the required inputs and evidence references.
3. Call `genos_compile_memory` and check `isError`, `success`, and the returned identifiers.
4. Report only the operation actually completed. A persisted decision or memory is not a promotion receipt.

If the MCP tools are unavailable, report that limitation; never replace a missing call with a fabricated result. Preserve leases, sandbox boundaries and evidence gates.
