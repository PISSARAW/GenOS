# GenOS Coding Guidelines & Architecture Standards

This document establishes the mandatory engineering standards, architectural constraints, and quality requirements for all code written within the GenOS ecosystem.

---

## 1. The Three Mandatory GenOS Rules

All code authored in GenOS (Rust, Python, TypeScript, documentation) must strictly adhere to these three core rules:

### Rule 1: File Length Limitation (Max 400 Lines)
- **Constraint**: No source code or documentation file may exceed **400 lines**.
- **Rationale**: Enforces modularity, domain cohesion, and prevents the emergence of monolithic "god" files.
- **Enforcement**: Continuous integration automated line-counter checks; PRs exceeding 400 lines fail CI immediately.
- **Remediation**:
  - Split large modules into cohesive submodules.
  - Extract helper structs and trait implementations into dedicated files.
  - Separate domain types into a `types.rs` file.
  - Partition execution logic into distinct pipeline stages.

### Rule 2: Function Parameter Limit (Max 3 Parameters)
- **Constraint**: Functions and methods must have at most **3 parameters**.
- **Rationale**: Minimizes cognitive load, eliminates argument-order bugs, and encourages composable parameter structs.
- **Enforcement**: Rust Clippy lint `too_many_arguments = "deny"` configured in root `Cargo.toml`.
- **Pattern: Parameter Objects**:
  ```rust
  // VIOLATION (> 3 arguments)
  pub fn fork_capsule(
      capsule_id: &str,
      branches: Vec<Branch>,
      root: &Path,
      dry_run: bool,
  ) -> Result<ForkResult>;

  // COMPLIANT (Parameter struct pattern)
  pub struct ForkOptions<'a> {
      pub capsule_id: &'a str,
      pub branches: Vec<Branch>,
      pub root: &'a Path,
  }

  pub fn fork_capsule(options: ForkOptions, dry_run: bool) -> Result<ForkResult> {
      // Implementation logic
      Ok(ForkResult::default())
  }
  ```

### Rule 3: Low Cyclomatic & Cognitive Complexity
- **Constraint**: Functions must be short, linear, and single-purpose. Deep nesting of conditional blocks and loops is strictly prohibited.
- **Enforcement**: Denied via `clippy::cognitive_complexity` and `clippy::cyclomatic_complexity`.
- **Guidelines**:
  - Max cyclomatic complexity per function: 8.
  - Max nesting depth: 2 levels.
  - Use early returns (`guard clauses`) to minimize indentation.
  - Utilize monadic combinators (`map`, `and_then`, `ok_or_else`) on `Option` and `Result`.
  - Extract inner loop bodies into dedicated worker functions.

---

## 2. Rust Safety & Idioms

### Zero Unsafe Policy
All GenOS crates deny unsafe code by default:
```rust
#![deny(unsafe_code)]
```
If an absolute requirement arises for FFI (e.g. low-level OS sandboxing or hardware acceleration), it must be isolated in a dedicated crate with comprehensive unit test safety proofs and an approved Architecture Decision Record (ADR).

### Clippy Linting Configuration
Every workspace member must pass pedantic and nursery lints. The root `Cargo.toml` specifies:
```toml
[workspace.lints.rust]
unsafe_code = "deny"
missing_docs = "warn"

[workspace.lints.clippy]
pedantic = { level = "warn", priority = -1 }
nursery = { level = "warn", priority = -1 }
too_many_arguments = "deny"
cognitive_complexity = "deny"
unwrap_used = "deny"
expect_used = "warn"
```

### Immutability & Ownership
- Make variables and bindings immutable by default.
- Prefer borrowing (`&T`, `&str`, `&Path`) over unnecessary cloning or allocations (`String`, `PathBuf`).
- Express state transitions via ownership transfer and builder patterns rather than in-place mutation.

---

## 3. Crate Boundary Hygiene

GenOS follows a strict acyclic dependency hierarchy:

```text
[ genos-core ] <--- [ genos-model ]
      ^                   ^
      |                   |
[ genos-store ]     [ genos-eval ]
      ^                   ^
      |                   |
[ genos-world ] <--- [ genos-runtime ]
                           ^
                           |
             +-------------+-------------+
             |                           |
     [ genos-protocol ]           [ genos-cli ]
             |
             v
     [ genos-mcp ]
```

### Module Encapsulation Rules
- Keep struct fields and internal helpers `pub(crate)` or private unless explicitly intended as public API.
- Do not expose third-party dependency types in public crate APIs; wrap them in domain types.
- Every crate must provide a clean, self-contained `lib.rs` with doc comments on all public items.
- Avoid circular dependencies between modules.

---

## 4. Struct Encapsulation & Construction Patterns

### Opaque Types and Builder Pattern
Structs representing complex domain entities should keep fields private and expose controlled constructors or builders:

```rust
#[derive(Debug, Clone)]
pub struct SnapshotConfig {
    cas_path: PathBuf,
    max_depth: usize,
    enable_compression: bool,
}

impl SnapshotConfig {
    pub fn new(cas_path: PathBuf) -> Self {
        Self {
            cas_path,
            max_depth: 32,
            enable_compression: true,
        }
    }

    pub fn with_max_depth(mut self, max_depth: usize) -> Self {
        self.max_depth = max_depth;
        self
    }

    pub fn with_compression(mut self, enabled: bool) -> Self {
        self.enable_compression = enabled;
        self
    }
}
```

---

## 5. Error Handling Standards

GenOS strictly separates domain errors from application error handling:

### Domain / Crate Errors: `thiserror`
Libraries and core crates define typed, exhaustive error enums using `thiserror`:

```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CapsuleError {
    #[error("Capsule '{0}' not found in registry")]
    NotFound(String),

    #[error("Execution budget exceeded (max: {max_steps}, consumed: {consumed_steps})")]
    BudgetExceeded {
        max_steps: usize,
        consumed_steps: usize,
    },

    #[error("CAS storage operation failed: {0}")]
    Storage(#[from] genos_store::StoreError),

    #[error("Replay state mismatch at sequence {sequence}")]
    StateMismatch {
        sequence: u64,
    },
}
```

### Application & CLI Error Context: `anyhow`
Top-level application entry points (`genos-cli`, `genos-mcp`) utilize `anyhow::Result` with rich context:

```rust
use anyhow::{Context, Result};

pub async fn run_capsule_execution(capsule_id: &str) -> Result<()> {
    let capsule = load_capsule(capsule_id)
        .with_context(|| format!("Failed to locate capsule '{capsule_id}' for execution"))?;

    execute_runtime(&capsule)
        .await
        .with_context(|| format!("Runtime execution failed for capsule '{capsule_id}'"))?;

    Ok(())
}
```

### Prohibition of `unwrap()`
- Never use `.unwrap()` in library code. Use `.expect("invariant description")` only when proving an unreachable state.
- Always propagate errors via `?` or map them explicitly using `map_err`.

---

## 6. Formatting & Linting Pipeline

Prior to submitting any pull request or committing changes, execute the verification suite:

```bash
# 1. Format code according to rustfmt specifications
cargo fmt --all -- --check

# 2. Run Clippy across all targets and deny all warnings
cargo clippy --workspace --all-targets --all-features -- -D warnings

# 3. Check for files exceeding the 400-line limit
python scripts/check_line_limits.py

# 4. Verify documentation builds cleanly without broken links
cargo doc --workspace --no-deps
```

---

## 7. Summary Checklist for Code Reviews

| Criterion | Requirement | Verification Command / Check |
|---|---|---|
| **File Length** | $\le 400$ lines | Automated CI check |
| **Function Parameters** | $\le 3$ parameters | `cargo clippy` (`too_many_arguments`) |
| **Complexity** | Linear flow, low nesting | `cargo clippy` (`cognitive_complexity`) |
| **Safety** | No `unsafe` blocks | `#![deny(unsafe_code)]` in all crates |
| **Error Handling** | `thiserror` for libs, `anyhow` for apps | Code review & compiler checks |
| **Code Style** | Standard `rustfmt` formatting | `cargo fmt --all -- --check` |
