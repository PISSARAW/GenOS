# Runbook: State Corruption Recovery & Disaster Restoration

This runbook specifies the formal disaster recovery protocols, cryptographic verification methods, and state reconstruction procedures for the GenOS event store and Content-Addressable Storage (CAS) tier.

---

## 1. Disaster Recovery Objectives & SLA Guarantees

GenOS maintains strict disaster recovery service level agreements:

- **Recovery Point Objective (RPO)**: **0 lost causal events**. Because the event stream $\mathcal{E}$ is an append-only write-ahead log, no committed state transitions may be lost during an outage.
- **Recovery Time Objective (RTO)**: **< 5 minutes**. Checkpoints and content-addressed blobs permit incremental state hydration without full workspace rebuilds.

```text
+---------------------+     Stream Replay      +---------------------+
| Genesis Capsule C_0 | ====================> | World State S_t     |
+---------------------+   e_1 -> e_2 -> e_n    +---------------------+
           |                                              |
           v                                              v
  [ Merkle Root M_0 ]                           [ Merkle Root M_t ]
```

---

## 2. Merkle Tree & DAG Integrity Verification Protocol

State in GenOS is represented as an immutable Merkle-Directed Acyclic Graph (Merkle-DAG). Every capsule checkpoint hash is computed as:

$$\mathcal{H}(\mathcal{C}) = \text{SHA256}(\text{GenomeHash} \mathbin{\Vert} \text{BeliefHash} \mathbin{\Vert} \text{WorldTreeHash} \mathbin{\Vert} \text{ParentHash})$$

### Verification Execution (`genos fsck`)

Run the full consistency check against the local state store:

```bash
# Execute deep Merkle DAG and CAS checksum verification
genos snapshot list --root .genos
```

### Protocol Validation Steps:
1. **CAS Object Integrity**: Verifies $\text{SHA256}(\text{BlobData}) == \text{BlobKey}$ for every object in `.genos/objects/`.
2. **DAG Lineage Continuity**: Asserts that every parent reference $P_i$ points to a valid, reachable snapshot manifest.
3. **World Tree Reference Validation**: Asserts that all Git commit tree references resolve against the underlying repository object database.

---

## 3. CAS Blob Store Repair & Reconstruction

If a CAS object is missing or corrupted due to filesystem failure:

```text
[ Corrupt Blob Detected ]
           |
     Remote CAS S3?
      /          \
   [YES]        [NO]
     |            |
 Pull from S3    Rebuild from Event Log: S_t = Fold(E, C_0)
```

### Step 1: Isolate Corrupt Hash
```bash
CORRUPT_HASH="a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0"
CHUNK_PREFIX="${CORRUPT_HASH:0:2}"
CHUNK_SUFFIX="${CORRUPT_HASH:2}"
OBJECT_PATH=".genos/objects/${CHUNK_PREFIX}/${CHUNK_SUFFIX}"
```

### Step 2: Fetch from Remote S3 / MinIO Tier
```bash
# Download pristine object from central CAS bucket
aws s3 cp \
  "s3://genos-cas-production/objects/${CHUNK_PREFIX}/${CHUNK_SUFFIX}" \
  "${OBJECT_PATH}.incoming"

# Validate SHA-256 before atomic activation
ACTUAL_HASH=$(sha256sum "${OBJECT_PATH}.incoming" | awk '{print $1}')
if [ "$ACTUAL_HASH" = "$CORRUPT_HASH" ]; then
    mv "${OBJECT_PATH}.incoming" "${OBJECT_PATH}"
    echo "CAS object successfully restored."
else
    echo "Hash mismatch on incoming replica object." >&2
    exit 1
fi
```

---

## 4. Event Log Replay Reconstruction

When no remote replica exists for a missing snapshot, rebuild the world state by replaying the causal event stream $\mathcal{E}$ from genesis capsule $\mathcal{C}_0$:

$$\mathcal{S}_n = \mathcal{S}_0 \circ e_1 \circ e_2 \circ \dots \circ e_n$$

### Step 1: Query Event Log Continuity
```bash
# Verify event sequence monotonicity and detect gaps
genos dev bisect-agent --root .genos --dimension events --state "scan=all"
```

### Step 2: Materialize State via Canonical Replay
```bash
# Replay state transitions from the nearest verified ancestor
genos agent replay \
  --snapshot "<NEAREST_VALID_SNAPSHOT_ID>" \
  --root .genos
```

### Step 3: Reseal Reconstructed Snapshot
```bash
# Commit reconstituted state into an atomic capsule
genos agent snapshot \
  --root .genos \
  --label "reconstructed-checkpoint-$(date +%s)"
```

---

## 5. Distributed Split-Brain Reconciliation

In multi-node environments, network partitions may cause concurrent diverging branches $\mathcal{B}_A$ and $\mathcal{B}_B$.

```text
          +---> Node A Branch (V_A = [5, 2])
          |
Genesis --+
          |
          +---> Node B Branch (V_B = [3, 4])
```

### Step 1: Compare Vector Clocks
Evaluate causal dominance between nodes:

- If $V_A \ge V_B$, Branch A dominates Branch B; fast-forward B.
- If $V_A \parallel V_B$ (concurrent), initiate quorum consensus.

### Step 2: Trigger Network Quorum & Swarm Consensus
```bash
# Evaluate network quorum across cluster nodes
genos biomimicry network-quorum --node "node-prod-01"

# Resolve concurrent branch states via swarm voting
genos biomimicry swarm-consensus --vote Explore --target "split_brain_resolution"
```

### Step 3: Execute Cognitive Merge
Merge non-conflicting divergent state branches:
```bash
# Merge Branch A and Branch B into reconciled branch
genos agent merge \
  --source-a "<SNAPSHOT_A_ID>" \
  --source-b "<SNAPSHOT_B_ID>" \
  --root .genos
```

---

## 6. Automated State Recovery Script

Save as `scripts/recover_state.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

verify_cas_object() {
    local hash_val="$1"
    local file_path="$2"
    local computed
    computed=$(sha256sum "$file_path" | awk '{print $1}')
    [ "$computed" = "$hash_val" ]
}

restore_from_s3() {
    local bucket="$1"
    local hash_val="$2"
    local dest_dir="$3"
    local prefix="${hash_val:0:2}"
    local suffix="${hash_val:2}"
    aws s3 cp "s3://${bucket}/objects/${prefix}/${suffix}" "${dest_dir}/${prefix}/${suffix}"
}

# Execute recovery helper (max 3 parameters)
restore_from_s3 "genos-cas-production" "$1" ".genos/objects"
verify_cas_object "$1" ".genos/objects/${1:0:2}/${1:2}"
echo "Object $1 restored and verified."
```

---

## 7. Post-Recovery Validation Checklist

Prior to restoring production traffic, complete this checklist:

- [ ] **Merkle Root Match**: Checksum verification passes with zero errors (`genos snapshot list`).
- [ ] **Event Log Monotonicity**: No gap in event sequence sequences (`e.sequence > from_sequence`).
- [ ] **World Sandbox Isolation**: Verify file isolation across branches (`genos world check-file`).
- [ ] **Lock Store Cleanliness**: Ensure no stale `.lock` files remain in `.genos/locks/`.
- [ ] **Service Readiness**: Synthetic smoke test command executes and seals successfully:
  ```bash
  genos agent run --command "echo 'system verified'" --root .genos
  ```
- [ ] **Living ADR Updated**: Log recovery actions via `genos dev record-decision`.

