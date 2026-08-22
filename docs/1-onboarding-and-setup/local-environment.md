# Local Environment Setup & System Requirements

This document provides a comprehensive guide for setting up, compiling, configuring, and verifying the GenOS development environment across Linux, macOS, and Windows systems.

---

## 1. System Architecture & Prerequisites

GenOS requires a 64-bit operating system with hardware virtualization or native POSIX-compliant workspace capabilities to manage isolated sandbox execution and Git worktrees.

### 1.1 Minimum & Recommended Specifications

| Component | Minimum Specification | Recommended Specification | Purpose in GenOS |
| :--- | :--- | :--- | :--- |
| **Rust Toolchain** | `1.88.0` (Stable) | `1.88+` (Latest Stable) | Workspace compilation, Clippy lints, SIMD |
| **Git Engine** | `2.30.0` | `2.42.0+` | Copy-on-write Git worktree isolation |
| **C/C++ Compiler** | GCC 9+, Clang 11+, MSVC 2022 | Clang 16+ / MSVC 19.38+ | Native bindings (`sqlx`, `openssl-sys`, `sqlite3`) |
| **Storage Engine** | Embedded SQLite 3.35+ | SQLite 3.40+ / PostgreSQL 16+ | Snapshot index, event sourcing, metadata DB |
| **Memory (RAM)** | 8 GB | 32 GB | Concurrent sandbox worktrees & memory graphs |
| **GPU (Optional)** | Vulkan 1.2 / Metal / DX12 | WebGPU / CUDA compatible | `epsilon_wgpu` accelerated lattice exploration |

---

## 2. Operating System Setup Guides

### 2.1 Linux (Debian, Ubuntu, Fedora, Arch)

1. **Install Base System Dependencies & Headers**:
   ```bash
   # Debian / Ubuntu (22.04 LTS, 24.04 LTS)
   sudo apt-get update && sudo apt-get install -y \
     build-essential \
     pkg-config \
     libssl-dev \
     git \
     curl \
     sqlite3 \
     libsqlite3-dev

   # Fedora / RHEL (39, 40)
   sudo dnf install -y \
     gcc \
     gcc-c++ \
     pkgconfig \
     openssl-devel \
     git \
     curl \
     sqlite \
     sqlite-devel

   # Arch Linux
   sudo pacman -Syu --needed \
     base-devel \
     openssl \
     git \
     curl \
     sqlite
   ```

2. **Install Rust via Rustup**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
   source "$HOME/.cargo/env"
   rustup update stable
   rustup component add clippy rustfmt
   ```

---

### 2.2 macOS (Apple Silicon & Intel)

1. **Install Xcode Command Line Utilities & Homebrew**:
   ```bash
   xcode-select --install
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install Required Libraries**:
   ```bash
   brew install openssl@3 pkg-config git sqlite
   ```

3. **Configure Environment for Compilers**:
   ```bash
   export OPENSSL_ROOT_DIR="$(brew --prefix openssl@3)"
   export PKG_CONFIG_PATH="$(brew --prefix openssl@3)/lib/pkgconfig:$PKG_CONFIG_PATH"
   ```

4. **Install Rust**:
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
   source "$HOME/.cargo/env"
   rustup update stable
   rustup component add clippy rustfmt
   ```

---

### 2.3 Windows (Windows 10 / 11)

1. **Install MSVC Build Tools**:
   - Install **Visual Studio 2022 Community** or **Visual Studio Build Tools 2022**.
   - Enable the **"Desktop development with C++"** workload (including MSVC v143 toolset, Windows 11 SDK, and C++ CMake tools).

2. **Install Git for Windows**:
   - Download and install Git from `https://git-scm.com`.
   - Ensure "Enable symbolic links" is checked during installation.

3. **Enable Windows Developer Mode (Mandatory for Sandboxing)**:
   - Open **Settings > System > For developers**.
   - Toggle **Developer Mode** to **ON**.
   - *Technical Rationale*: GenOS provisions atomic sandboxes and Git worktrees requiring symbolic links (`CreateSymbolicLinkW`). Enabling Developer Mode grants `SeCreateSymbolicLinkPrivilege` to standard user processes without elevation.

4. **Install Rust Toolchain**:
   - Download and run `rustup-init.exe` from `https://rustup.rs`.
   - In PowerShell:
     ```powershell
     rustup default stable-x86_64-pc-windows-msvc
     rustup update stable
     rustup component add clippy rustfmt
     ```

---

## 3. Cloning, Compilation & Verification

### 3.1 Repository Cloning

```bash
git clone https://github.com/PISSARAW/GenOS.git
cd GenOS
```

### 3.2 Building the CLI & Core Crates

```bash
# Build the production CLI binary
cargo build --release -p genos-cli

# Build the entire Cargo workspace
cargo build --workspace

# (Optional) Verify WebGPU lattice compute engine
cargo build -p epsilon_wgpu
```

### 3.3 Running Test & Quality Verification

GenOS enforces zero-warning builds and rigorous unit/integration test suites:

```bash
# Execute the entire test matrix across all 13 workspace crates
cargo test --workspace

# Verify code formatting
cargo fmt --all -- --check

# Enforce strict Clippy lint invariants
cargo clippy --workspace --all-targets -- -D warnings
```

---

## 4. Configuration Hierarchy & Environment Variables

GenOS resolves configuration through a strict 3-tier precedence hierarchy:
$$\text{Runtime Flags} \succ \text{Environment Variables} \succ \text{Workspace Config } (.genos/config.toml) \succ \text{Global Config } (~/.genos/config.toml)$$

### 4.1 Environment Variables Reference

```bash
# ==============================================================================
# 1. Logging & Diagnostics
# ==============================================================================
export GENOS_LOG="info,genos_runtime=debug,genos_core=debug,genos_store=trace"

# ==============================================================================
# 2. Filesystem & Storage Paths
# ==============================================================================
export GENOS_ROOT_DIR=".genos"
export GENOS_STORE_PATH="$HOME/.genos/data"
export GENOS_SANDBOX_DIR="$HOME/.genos/sandboxes"

# ==============================================================================
# 3. Database Persistence Engine
# ==============================================================================
# SQLite local backend (default):
export DATABASE_URL="sqlite://$HOME/.genos/data/genos.db?mode=rwc"

# PostgreSQL distributed backend (optional):
# export DATABASE_URL="postgres://genos_user:secret_pass@127.0.0.1:5432/genos_db"

# ==============================================================================
# 4. Networking & Telemetry API
# ==============================================================================
export GENOS_BIND_ADDR="127.0.0.1:8080"
export GENOS_METRICS_ENABLED="true"

# ==============================================================================
# 5. Model Providers & Inference Endpoints
# ==============================================================================
export GENOS_MODEL_PROVIDER="mock"  # "mock" | "openai" | "anthropic" | "ollama"
export OPENAI_API_KEY=""
export ANTHROPIC_API_KEY=""
export OLLAMA_HOST="http://127.0.0.1:11434"
```

---

## 5. Storage Hierarchy & Content-Addressable Store (CAS) Layout

GenOS maintains an immutable, content-addressable storage topology under `.genos/`:

```text
.genos/
├── config.toml                      # Workspace configuration overrides
├── data/
│   ├── cas/                         # Content-Addressable Storage (Immutable Blobs)
│   │   └── objects/
│   │       ├── 3a/
│   │       │   └── 8f190e2...       # 256-bit SHA-256 content-addressed chunk
│   │       └── e7/
│   │           └── 4c901a8...       # AST node, genome fragment, or tool output
│   ├── snapshots/                   # Replayable snapshot journal
│   │   ├── agent-snapshots.jsonl
│   │   └── agent-snapshots-manifests.jsonl # Legacy read-only index, when present
│   ├── events/                      # Causal event log stream
│   │   └── events.jsonl
│   └── genos.db                     # Metadata index (SQLite database)
└── sandboxes/                       # Ephemeral Git worktrees & execution roots
    ├── cap-018f-branch-a/           # Worktree for counterfactual branch A
    └── cap-018f-branch-b/           # Worktree for counterfactual branch B
```

### 5.1 Mathematical Storage Model

Each stored entity $E$ is indexed by its cryptographic content hash:
$$\text{CasHash}(E) = \text{SHA-256}(\text{CanonicalSerialization}(E))$$

The root snapshot hash $R_S$ is computed as a Merkle composition:
$$R_S = \text{SHA-256}\left(\text{CasHash}(G) \parallel \text{CasHash}(S_{\text{cognitive}}) \parallel \text{CasHash}(W_{\text{fs}})\right)$$
where $G$ is the Agent Genome, $S_{\text{cognitive}}$ is the internal cognitive state, and $W_{\text{fs}}$ is the tracked filesystem tree.

This guarantees $O(1)$ state deduplication across thousands of counterfactual agent branches:
$$\text{Storage Overhead}(\text{Fork}_k) = O(\Delta W_k) + O(\Delta S_k) \ll O(W_0 + S_0)$$

---

## 6. Verification & Health Check

Confirm system operation by running the verification suite:

```bash
# 1. Initialize local repository state
./target/release/genos init

# 2. Inspect active runtime configuration
./target/release/genos dev repository-genome

# 3. Test mock inference provider
cargo run -p genos-model --example mock_inference

# 4. Start local API server in background
cargo run -p genos-api &
SERVER_PID=$!

# 5. Query health endpoint
curl -s http://127.0.0.1:8080/health | jq .

# 6. Stop server
kill $SERVER_PID
```

Expected Health Output:
```json
{
  "status": "healthy",
  "version": "0.0.1",
  "storage_backend": "sqlite",
  "cas_objects_count": 0,
  "active_capsules": 0
}
```

---

## 7. Troubleshooting Matrix

| Symptom / Error | Root Cause | Exact Resolution |
| :--- | :--- | :--- |
| `os error 1314: A required privilege is not held by the client` | Windows symlink privilege restriction when creating Git worktrees. | Enable **Developer Mode** in Windows Settings or run terminal with admin rights. |
| `fatal error: 'openssl/ssl.h' file not found` | Missing C headers for OpenSSL during `sqlx` or `reqwest` native compilation. | Run `sudo apt-get install libssl-dev` (Linux) or `brew install openssl@3` (macOS). |
| `error[E0658]: use of unstable library feature` | Rust compiler version is older than minimum supported `1.88.0`. | Execute `rustup update stable` to synchronize toolchain. |
| `database is locked (code 5)` | Concurrent SQLite write contention on `genos.db`. | Verify no orphaned background agent process is holding write locks, or configure WAL mode via `PRAGMA journal_mode=WAL;`. |
| `git worktree add failed: fatal: not a valid object name` | Sandbox world creation attempted on a repository with no initial Git commit. | Execute `git commit --allow-empty -m "Initial commit"` before provisioning worktrees. |
