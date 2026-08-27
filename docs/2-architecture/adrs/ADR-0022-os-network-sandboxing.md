# ADR 0022: OS and Network Sandboxing via External Backends

## Status
Accepted

## Context
GenOS ensures file and working-directory isolation via world providers (like `DirectoryWorldProvider` and `GitWorktreeWorldProvider`). However, the executed processes within these isolated directories previously inherited the host OS environment and had full access to the network, lacking true OS-level containerization or sandboxing. This limits the ability to safely run untrusted code or ensure strict deterministic executions completely devoid of network side-effects.

To support robust, secure multi-tenant execution and deterministic isolation without forcing heavy abstractions on local users, GenOS needs optional OS and network sandboxing.

## Decision
We will provide an optional, configurable `SandboxConfig` to the `WorldProvider` backend execution primitives, leveraging existing lightweight containerization and VM boundaries:
- `bwrap` (Bubblewrap) for native lightweight namespace isolation on Linux.
- `sandbox-exec` for macOS native profile-based isolation.
- `gVisor` (`runsc`) for highly secure user-space kernel isolation.
- `Firecracker` for microVM-based strict isolation.

The configuration will define `network_enabled` and required volume mounts (read-only or writable). The underlying backend (CLI and MCP tools via `genos_run`) will allow specifying a `--sandbox-backend` and `--sandbox-network`. The default behavior will remain non-sandboxed unless a backend is auto-detected (like Bwrap on Linux) or explicitly selected.

## Consequences

### Positive
- **Security & Isolation**: Allows running untrusted generated code safely using gVisor or Firecracker.
- **Determinism**: Restricting network access forces agents to rely solely on the explicit capabilities provided by the OS.
- **Flexibility**: The `SandboxBackend` enum supports switching between lightweight tools (Bwrap) and secure ones (gVisor).

### Negative
- **Complexity**: Requires external dependencies (runsc, firectl, bwrap) to be installed on the host to utilize these features.
- **Performance Overhead**: Depending on the backend (like Firecracker), spinning up the sandbox may introduce a small overhead compared to raw host execution.
