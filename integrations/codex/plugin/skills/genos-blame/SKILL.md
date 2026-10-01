---
name: genos-blame
description: Trace code, tests, requirements, or decisions back to cognitive decisions and evidence. Use when asked why an artifact exists.
---

# GenOS Blame

Use `genos_blame` with its discovered schema and caller-supplied inputs. Read the tool description for its actual scope.

1. Inspect the MCP schema; preserve agent and tenant identity.
2. Collect the required inputs and evidence references.
3. Call `genos_blame` and check `isError`, `success`, and the returned identifiers.
4. Report only the operation actually completed. A persisted decision or memory is not a promotion receipt.

If the MCP tools are unavailable, report that limitation; never replace a missing call with a fabricated result. Preserve leases, sandbox boundaries and evidence gates.
