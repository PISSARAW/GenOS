---
name: genos-record-experience
description: Persist successful or failed branch experience with context, outcome, evidence, and provenance. Use after an approach produces reusable knowledge.
---

# GenOS Record Experience

Use `genos_record_experience` with its discovered schema and caller-supplied inputs. Read the tool description for its actual scope.

1. Inspect the MCP schema; preserve agent and tenant identity.
2. Collect the required inputs and evidence references.
3. Call `genos_record_experience` and check `isError`, `success`, and the returned identifiers.
4. Report only the operation actually completed. A persisted decision or memory is not a promotion receipt.

If the MCP tools are unavailable, report that limitation; never replace a missing call with a fabricated result. Preserve leases, sandbox boundaries and evidence gates.
