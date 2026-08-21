# GenOS AI Documentation Governance & Update Policy

This document defines the mandatory quality, modularity, synchronization, and traceability standards for creating, refactoring, and maintaining documentation across the GenOS repository.

---

## 1. Documentation Governance & Core Philosophy

In GenOS, documentation is treated as a **living architectural contract**, not post-hoc commentary. AI agents and human engineers rely on these documents for formal invariants, API schemas, mathematical proofs, and biological biomimicry mechanics.

### Core Principles
1. **Single Source of Truth**: Documentation must precisely reflect the active Rust crate implementations (`crates/*`).
2. **Contractual Precision**: Mathematical formulations, state models, and invariant tables must be exact and reproducible.
3. **Continuous Synchronization**: Code and documentation evolve synchronously; asynchronous doc drift is treated as a build failure.

---

## 2. Modularity & Strict Line Count Ceiling ($\le 400$ Lines)

Every Markdown file (`.md`) across the repository must strictly comply with the **GenOS 400-Line Limit**:

### 2.1 Enforcement Rules
- **Hard Ceiling**: No `.md` file may exceed **400 total lines**.
- **Audit Verification**: AI agents must verify line counts using automated tools or line-counting utilities before finalizing tasks.

### 2.2 Decomposition Protocol for Large Domains
When a domain topic or architectural specification grows to exceed 400 lines:
1. **Create Sub-Directory**: Establish a dedicated directory (e.g., `docs/3-features-and-domain/biomimicry/`).
2. **Decompose into Focused Sub-Chapters**: Partition content along natural architectural boundaries (e.g., `swarm.md`, `network.md`, `flocking.md`, `mycelium.md`).
3. **Provide Master Index**: Create a concise entrypoint `README.md` or index document with summaries and navigation links.

---

## 3. Code Snippet & Interface Compliance

All code snippets embedded within documentation files are subject to the same strict quality standards as production Rust code.

### 3.1 Function Parameter Ceiling ($\le 3$)
- Every function, constructor, or method signature in documentation snippets must have **$\le 3$ parameters**.
- Functions with more than 3 logical parameters must use configuration structs (`Config`, `Context`, `Options`):
  ```rust
  // Prohibited in docs:
  pub fn evaluate_trait_drift(expected: f64, observed: f64, tolerance: f64, n_samples: usize, p_threshold: f64) -> TraitDivergence;

  // Compliant in docs:
  pub struct DriftEvalConfig {
      pub tolerance: f64,
      pub n_samples: usize,
      pub p_threshold: f64,
  }
  pub fn evaluate_trait_drift(expected: f64, observed: f64, config: &DriftEvalConfig) -> TraitDivergence;
  ```

### 3.2 Syntactic Validity & Real Types
- Embedded code snippets must represent syntactically valid Rust (or Python/TypeScript where appropriate).
- Avoid pseudo-code approximations that diverge from actual crate definitions (`genos-core`, `genos-world`, `genos-runtime`, `genos-eval`).

---

## 4. Documentation Lifecycle & State Transitions

Documents within GenOS follow a defined lifecycle state machine:

```
    +---------------+       +----------------+       +-------------------+
    |     DRAFT     | ----> |     ACTIVE     | ----> |    SUPERSEDED     |
    |  (Proposal)   |       |  (Canonical)   |       | (Replaced by ADR) |
    +---------------+       +----------------+       +-------------------+
                                    |
                                    v
                            +----------------+
                            |   DEPRECATED   |
                            | (Decommission) |
                            +----------------+
```

### 4.1 Required Metadata Header
Every major architectural or feature document must begin with a standardized header:
- **Title**: Clear, descriptive `# Heading 1`.
- **Status / Domain**: Architectural level, associated ADRs, and owning crate.
- **Executive Summary**: 1–2 paragraphs summarizing the core concept and biological or distributed systems foundation.

### 4.2 Deprecation & Superseding Protocol
When an architectural pattern or API is superseded:
- Do not silently delete the historical context if referenced by existing ADRs.
- Add an explicit deprecation banner at the top pointing to the new canonical document or ADR.
- Update all inbound links across `docs/` to maintain link integrity.

---

## 5. Traceability & Cross-Referencing Requirements

To ensure end-to-end architectural coherence, documentation updates must preserve traceability across the repository matrices:

```
  +-----------------------------------------------------------------------+
  |               GENOS TRACEABILITY TRIANGLE                             |
  +-----------------------------------------------------------------------+
        ^                                                           ^
        |                                                           |
        v                                                           v
  +-----------------------------------+     +-----------------------------------+
  |  docs/2-architecture/             |     |  docs/2-architecture/             |
  |  traceability-matrix.md           | <-> |  project-primitive-matrix.md      |
  +-----------------------------------+     +-----------------------------------+
        ^                                                           ^
        |                                                           |
        v                                                           v
  +-----------------------------------------------------------------------+
  |  Domain Feature Specs (`docs/3-features-and-domain/`)                 |
  |  Architecture Decision Records (`docs/2-architecture/adrs/`)          |
  +-----------------------------------------------------------------------+
```

### 5.1 Invariant Anchoring (`INV-xxx`)
- Any discussion of system integrity, storage immutability, replay guarantees, or resilience triggers must reference the formal invariant IDs (`INV-001` through `INV-010`) defined in `docs/.ai/invariants.md`.

### 5.2 Matrix Synchronization
When introducing or modifying a core primitive (e.g., a new snapshot variant or biomimicry protocol):
1. Register the primitive in `docs/2-architecture/project-primitive-matrix.md`.
2. Add the corresponding requirement-to-crate mapping in `docs/2-architecture/traceability-matrix.md`.
3. Document the rationale in an ADR under `docs/2-architecture/adrs/`.

---

## 6. Atomic Code-Documentation Synchronization Protocol

Documentation and source code must be updated in the same atomic operation.

### 6.1 Synchronization Checklist for AI Agents
Before concluding any feature, refactoring, or bugfix task:
1. **API Audit**: Did any function signatures, struct fields, or CLI arguments change? If yes, update the corresponding markdown snippets.
2. **Matrix Audit**: Are new crates, error types, or invariants introduced? Update the traceability matrices.
3. **Line Count Audit**: Verify that all modified `.md` files remain $\le 400$ lines.
4. **Signature Audit**: Verify that all updated code snippets in `.md` files have $\le 3$ parameters.

### 6.2 Pre-Commit Verification Workflow
AI agents should execute a verification sweep across modified docs:
- Count total lines per file to confirm $\le 400$.
- Scan function signatures in code blocks to confirm $\le 3$ arguments.
- Check that all relative markdown links resolve to existing files.

---

## 7. Prohibited Practices & Forensic Quality Gates

The following practices represent strict compliance violations in GenOS:

| Prohibited Practice | Rationale & Remediation |
| :--- | :--- |
| **Stub Placeholders (`TODO`, `TBD`)** | Unfinished documentation violates the zero-stub standard. Provide complete, verified technical text. |
| **Monolithic Markdown (> 400 lines)** | Degrades readability and context-window efficiency. Decompose into sub-chapters immediately. |
| **Signatures with > 3 Parameters** | Violates GenOS Rule 2. Bundle excess parameters into a dedicated config struct. |
| **Unverified Mathematical Claims** | Hand-waving or unproven formulas compromise system rigor. Include formal definitions and boundary conditions. |
| **Orphaned Documents** | New documents must be linked from parent indices, READMEs, or matrices. |
