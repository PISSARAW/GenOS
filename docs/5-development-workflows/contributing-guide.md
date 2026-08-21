# GenOS Contributing Guide & Governance

Welcome to the GenOS open-source ecosystem. We appreciate your contributions to advancing counterfactual simulations, isolated worktrees, and deterministic agent runtimes.

This guide defines the end-to-end development workflow, branch naming policies, RFC processes, Architecture Decision Records (ADRs), commit conventions, and repository governance.

---

## 1. Branch Naming Conventions

All branches created in the repository or contributor forks must use structured prefixes:

| Prefix | Use Case | Example |
|---|---|---|
| `feat/` | New features or major capabilities | `feat/cas-s3-backend` |
| `fix/` | Bug fixes and defect remediation | `fix/worktree-lock-timeout` |
| `exp/` | Experimental simulations or research spikes | `exp/mcts-entropy-heuristic` |
| `perf/` | Performance optimizations and benchmarks | `perf/snapshot-zstd-chunking` |
| `docs/` | Documentation additions or corrections | `docs/runbook-incident-triage` |
| `refactor/` | Code refactoring without behavioral change | `refactor/split-world-provider` |
| `chore/` | CI/CD, dependency updates, tooling | `chore/upgrade-rust-1-84` |

---

## 2. Commit Message Standards (Conventional Commits)

GenOS enforces the [Conventional Commits v1.0.0](https://www.conventionalcommits.org/) standard.

### Format
```text
<type>(<scope>): <short imperative summary>

[optional detailed description explaining WHY, not WHAT]

[optional breaking changes or issue references]
```

### Allowed Scopes
`core`, `store`, `world`, `runtime`, `eval`, `protocol`, `cli`, `mcp`, `ops`, `docs`.

### Examples
```text
feat(store): implement zstd streaming compression for CAS blobs

Add streaming zstd compression to optimize disk utilization during
high-frequency snapshot generation without blocking the tokio runtime.

Closes #142
```

```text
fix(world): release git index lock upon unhandled subagent panic

Ensure worktree cleanup hooks execute even when subagent processes
exit abnormally, preventing stale index.lock file contention.
```

---

## 3. Pull Request (PR) Lifecycle

Every pull request undergoes strict automated validation and peer review before merging.

```text
+--------------+     +-------------------+     +------------------+
| Fork/Branch  | --> | Pre-Commit Checks | --> | Push & Open PR   |
+--------------+     +-------------------+     +------------------+
                                                        |
                                                        v
+--------------+     +-------------------+     +------------------+
| Merge (Squash| <-- | Review & Approval | <-- | Automated CI Gate|
+--------------+     +-------------------+     +------------------+
```

### Step 1: Pre-Submission Checklist
Before opening a PR, ensure local compliance:
```bash
# 1. Format code
cargo fmt --all -- --check

# 2. Run Clippy lints with all features
cargo clippy --workspace --all-targets --all-features -- -D warnings

# 3. Verify all workspace tests pass
cargo test --workspace

# 4. Check file line length limit (<= 400 lines)
python scripts/check_line_limits.py
```

### Step 2: PR Description Requirements
Every PR must include:
1. **Summary**: Concise description of changes.
2. **Motivation**: Problem statement or issue reference.
3. **Verification**: Exact commands run and test results.
4. **Breaking Changes**: Explicit declaration if any public API changed.

---

## 4. Request for Comments (RFC) Process

Substantial architectural changes, protocol modifications, or new subsystem proposals require an RFC prior to implementation.

### Trigger Criteria for an RFC
- Adding a new crate or major dependency.
- Altering the wire protocol (`genos-protocol`) or MCP tool definitions.
- Changing the CAS storage schema or snapshot serialization format.
- Modifying security sandbox boundaries or isolation guarantees.

### RFC Stages
1. **Draft**: Create `rfcs/YYYYMMDD-proposal-name.md` using the RFC template.
2. **Discussion**: Submit a PR labeled `rfc:in-discussion`. Community and maintainers review over a minimum 7-day window.
3. **Consensus**: Consensus is reached when at least 2 maintainers approve and no unresolved blocking objections remain.
4. **Final Comment Period (FCP)**: 3-day window to raise final objections.
5. **Accepted / Rejected**: Merged into `rfcs/accepted/` or closed with rationale.

---

## 5. Architecture Decision Records (ADRs)

ADRs capture significant technical decisions, architectural trade-offs, and compliance rationale. ADRs are stored under `docs/2-architecture/adr/`.

### ADR Template

```markdown
# ADR-0000: [Short Title of Decision]

## Status
[Proposed | Accepted | Superseded | Deprecated]

## Context
What is the technical context, constraint, or problem we are facing?
Include relevant background and alternative solutions considered.

## Decision
What is the change or architecture decision we are committing to?
Explain the core rationale and how it satisfies GenOS principles.

## Consequences
- **Positive**: What benefits or guarantees do we achieve?
- **Negative / Trade-offs**: What complexity or operational overhead is introduced?
- **Neutral**: What patterns or workflows are altered?

## Compliance & Verification
How will this decision be enforced in CI, code review, or runbooks?
```

---

## 6. Governance & Review Model

GenOS follows a distributed, meritocratic governance model.

### Roles & Responsibilities

1. **Maintainers**:
   - Triage issues, review RFCs, approve PRs, and manage releases.
   - Guard repository security and cryptographic determinism invariants.
2. **Reviewers / Subagent Auditors**:
   - Perform automated static analysis, property verification, and benchmark validation.
   - Enforce the 3 GenOS rules (max 400 lines, max 3 params, low complexity).
3. **Contributors**:
   - Propose features, report bugs, author runbooks, and submit PRs.

### Review Criteria
- [ ] **Strict Line Count**: No file exceeds 400 lines.
- [ ] **Function Signatures**: At most 3 parameters per function.
- [ ] **Low Complexity**: Cyclomatic complexity $\le 8$, nesting $\le 2$.
- [ ] **Zero Unsafe**: `#![deny(unsafe_code)]` present and respected.
- [ ] **Test Coverage**: Co-located unit tests and property tests included.
- [ ] **Deterministic Behavior**: Zero unseeded randomness or unmocked clocks.

---

## 7. Security Vulnerability Reporting

If you discover a security vulnerability (such as a sandbox escape, CAS collision vulnerability, or remote code execution), do **NOT** open a public issue.

Submit a confidential report to `security@genos.dev` or via GitHub Private Vulnerability Reporting. Security advisories are triaged within 24 hours.
