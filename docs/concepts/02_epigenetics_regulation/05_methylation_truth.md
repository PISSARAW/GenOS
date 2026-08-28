# 5. DNA Methylation (Source of Truth)

DNA Methylation systematically prevents the LLM from authoring tautological tests (e.g., asserting `Bug == Bug`).

For context on other structural DNA modifications, refer to [Epigenetics](./01_epigenetics.md).

---

## 5.1 Core Principle
When an agent writes a test that dynamically generates the `expected` variable utilizing the identical logic as the `actual` variable, the test will perpetually pass, even if the core business logic is profoundly flawed (due to symmetric error). In biological systems, methylation chemically marks the "original" DNA strand with a methyl group, ensuring that during a mismatch event, the repair proteins can deterministically identify the uncorrupted source strand.

The Anthony Orchestrator enforces this exact paradigm: tests must rigidly compare results against an immutable `Source of Truth` that is chemically "methylated" by the framework. The agent is fundamentally restricted from dynamically regenerating this source of truth on the fly, ensuring cryptographic-level test integrity.
