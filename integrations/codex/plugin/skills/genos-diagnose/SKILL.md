---
name: genos-diagnose
description: Build falsifiable diagnostic hypotheses before changing code. Use for debugging, incidents, unexplained failures, and problems requiring competing testable explanations.
---

# GenOS Diagnose

Use `genos_diagnose` with its discovered schema and caller-supplied inputs. Read the tool description for its actual scope.

1. Inspect the MCP schema; preserve agent and tenant identity.
2. Collect the required inputs and evidence references.
3. Call `genos_diagnose` and check `isError`, `success`, and the returned identifiers.
4. Report only the operation actually completed. A persisted decision or memory is not a promotion receipt.

If the MCP tools are unavailable, report that limitation; never replace a missing call with a fabricated result. Preserve leases, sandbox boundaries and evidence gates.
