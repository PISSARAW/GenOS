# Runbook: Production Troubleshooting & Error Remediation

This runbook provides actionable diagnostic flows and recovery procedures for resolving common failure modes, error codes, worktree contention, snapshot corruption, and timeout issues across GenOS runtime environments.

---

## 1. Common GenOS Error Codes

| Error Code | Error Name | Immediate Cause | Action / Runbook Reference |
|---|---|---|---|
| `E_0101` | `E_CAS_MISMATCH` | Computed hash does not match stored CAS blob digest. | See [Section 6: CAS Hash Mismatch](#6-cas-hash-mismatch-remediation) |
| `E_0201` | `E_WORKTREE_LOCK_TIMEOUT` | Worktree lock lease expired or `.git/index.lock` present. | See [Section 2: Worktree Lock Contention](#2-worktree-lock-contention) |
| `E_0301` | `E_REPLAY_DIVERGENCE` | Event replay produced a non-matching state hash. | See [Incident Response Runbook](incident-response.md) |
| `E_0401` | `E_SANDBOX_VIOLATION` | Sandbox intercepted forbidden syscall or escape attempt. | Terminate worker pod; quarantine node |
| `E_0501` | `E_GENOME_INVALID` | Genome mutation produced ill-typed or cyclic AST. | Revert mutation node in lineage DAG |
| `E_0601` | `E_MCTS_TIMEOUT` | Trajectory evaluation exceeded configured step budget. | See [Section 5: Timeout Diagnosis](#5-timeout-diagnosis) |
| `E_0701` | `E_ZOMBIE_WORKTREE` | Worktree process terminated without releasing mount. | See [Section 3: Zombie Process & Worktree Cleanup](#3-zombie-process--worktree-cleanup) |

---

## 2. Worktree Lock Contention

### Symptoms
- CLI or MCP returns `E_WORKTREE_LOCK_TIMEOUT`.
- Agent hangs when attempting to checkout or commit changes to a capsule worktree.

### Diagnostics
```bash
# Check for stale lock files in the worktree directory
find /var/lib/genos/worktrees -name "index.lock" -o -name "HEAD.lock"

# Identify processes holding file handles on worktrees
lsof +D /var/lib/genos/worktrees
```

### Remediation Procedure
1. Check if the locking PID is actively executing:
   ```bash
   ps -p <PID> -o pid,stat,time,cmd
   ```
2. If the PID is dead or unresponsive (>10m runtime with zero CPU activity), terminate it:
   ```bash
   kill -9 <PID>
   ```
3. Remove stale lock files safely:
   ```bash
   find /var/lib/genos/worktrees -name "index.lock" -delete
   ```
4. Unlock the worktree via Git:
   ```bash
   git -C /var/lib/genos/worktrees/<worktree-id> worktree unlock
   ```

---

## 3. Zombie Process & Worktree Cleanup

### Symptoms
- Worktree disk usage continuously rises.
- `genos_worktree_active_total` remains high despite zero active agent sessions.

### Diagnostics
```bash
# List all registered worktrees in the primary repository
git -C /var/lib/genos/repo worktree list

# Inspect zombie subagent processes in the worker namespace
ps -eo pid,ppid,stat,cmd | grep '[g]enos-sandbox'
```

### Automated Cleanup Script
```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Reaping orphan worktrees and stale temporary mounts..."

# Prune disconnected worktree metadata
git -C /var/lib/genos/repo worktree prune --verbose

# Cleanup empty directory structures
find /var/lib/genos/worktrees -mindepth 1 -maxdepth 1 -type d -empty -delete

echo "Worktree cleanup completed successfully."
```

---

## 4. Corrupt Snapshot Repair

### Symptoms
- Snapshot restore fails with `E_CORRUPT_SNAPSHOT_MANIFEST`.
- Merkle root verification fails during startup probe (`/livez`).

### Remediation Flow

```text
+-----------------------+     +-----------------------+     +-----------------------+
| 1. Quarantine Snapshot| --> | 2. Traverse Merkle DAG| --> | 3. Reconstruct Chunks |
| Mark snapshot damaged |     | Identify missing leafs|     | Fetch from S3 replica |
+-----------------------+     +-----------------------+     +-----------------------+
```

```bash
# 1. Isolate and terminate damaged capsule
genos resilience apoptosis --agent-id "cap_84a92c"

# 2. Verify all referenced CAS blobs
genos snapshot list --verify-checksums --root .genos

# 3. Resync missing chunks from secondary replica
aws s3 sync \
  "s3://genos-cas-backup/blobs/" \
  ".genos/objects/"
```

---

## 5. Timeout Diagnosis

### Symptoms
- MCTS search or capsule execution terminates with `E_MCTS_TIMEOUT`.
- Agent latency spikes above configured SLA.

### Diagnostic Flow
1. **Check cgroup CPU Throttling**:
   ```bash
   cat /sys/fs/cgroup/genos/capsules/<cap-id>/cpu.stat | grep throttled
   ```
2. **Inspect Capsule Execution State**:
   ```bash
   genos capsule inspect "<cap-id>" --root .genos
   ```
3. **Verify Upstream LLM Endpoint Latency**:
   ```bash
   curl -o /dev/null -s -w 'Time Connect: %{time_connect}\nTotal Time: %{time_total}\n' \
     https://api.openai.com/v1/models
   ```

### Resolution
- If cgroup throttling is high: increase `cpu.max` allocation in Helm values.
- If thread is deadlocked on lock: execute lock release procedure.
- If upstream LLM latency is elevated: switch to backup fallback provider in `RuntimeConfig`.

---

## 6. CAS Hash Mismatch Remediation

### Symptoms
- CAS read returns `E_CAS_MISMATCH`.
- Checksum verification fails on blob decompression.

### Rust Remediation Helper
```rust
use genos_store::{CasStore, HashAlgorithm};

pub async fn repair_cas_blob(
    store: &CasStore,
    blob_id: &str,
    expected_digest: &[u8],
) -> Result<bool, StoreError> {
    if !store.verify_blob_hash(blob_id, expected_digest).await? {
        store.quarantine_blob(blob_id).await?;
        store.fetch_and_restore_replica(blob_id).await?;
        return Ok(true);
    }
    Ok(false)
}
```

### CLI Verification Command
```bash
# Deep scrub and Merkle verification of all CAS local chunks
genos snapshot list --verify-checksums --root .genos
```
