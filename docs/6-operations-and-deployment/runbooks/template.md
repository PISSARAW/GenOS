# Standard Production Runbook Template

This standardized template governs operational procedures, emergency incident response, and state maintenance workflows across GenOS production clusters.

---

## 1. Runbook Metadata

| Field | Value Specification | Example Value |
|---|---|---|
| **Runbook ID** | `RBK-GENOS-<SUBSYSTEM>-<NUMBER>` | `RBK-GENOS-STORE-001` |
| **Title** | Concise operational title | `CAS Storage Tier Replication Lag & Degradation` |
| **Severity Level** | `SEV-1 (Critical)` / `SEV-2 (High)` / `SEV-3 (Moderate)` / `SEV-4 (Minor)` | `SEV-2 (High)` |
| **Component** | Target GenOS subsystem | `CAS Store / Event Engine` |
| **SLO Impact** | Affected service level objectives | `Snapshot Commit Latency (P99 < 500ms)` |
| **Owner / Rotation** | Owning team and on-call rotation | `Storage-Engine / OnCall-Primary` |
| **Last Verified** | Date of last drill/verification | `2026-08-21` |

---

## 2. Trigger Conditions & Prometheus Alert Definitions

### Prometheus Alert Rules (PromQL)

```yaml
groups:
  - name: genos_operational_alerts
    rules:
      - alert: GenOSCASReplicationLagHigh
        expr: genos_cas_replication_lag_seconds{tier="s3"} > 30.0
        for: 2m
        labels:
          severity: high
          subsystem: cas-store
        annotations:
          summary: "CAS blob replication to S3 tier exceeds 30 seconds"
          runbook_url: "docs/6-operations-and-deployment/runbooks/state-corruption-recovery.md"
```

### Log Signatures & Telemetry Indicators
- **Log Pattern**: `ERROR genos_store::cas: Blob write failed: BrokenPipe / Timeout`
- **MCP Error Code**: `JSON-RPC Error -32000: StorageBackendUnavailable`

---

## 3. Blast Radius & Impact Assessment

- **Affected Capsules**: All active execution capsules in namespace `production`.
- **User Impact**: Codex / IDE MCP calls fail with transient timeout errors.
- **Data Risk**: Zero data loss (RPO = 0) due to local NVMe write-ahead event journal buffer.

---

## 4. Pre-Requisites & Required Privileges

Before executing this runbook, verify operator privileges:

- [ ] Kubernetes cluster access (`kubectl -n genos-system`).
- [ ] Read/Write access to local `.genos/` directory.
- [ ] AWS IAM permissions for S3 CAS bucket: `s3:GetObject`, `s3:PutObject`.
- [ ] GenOS CLI binary available in `$PATH` (`genos --version`).

---

## 5. Phase 1: Rapid Triage and Containment

Execute containment immediately to prevent cascading failures:

### Step 1: Trip Circuit Breaker on Failing Subsystem
```bash
# Isolate affected branch to prevent corrupted state generation
genos resilience circuit-breaker --branch-id "<AFFECTED_BRANCH_ID>"
```

### Step 2: Engage Stasis Mode if Contagion Spreads
```bash
# Freeze agent workers into cryptobiosis stasis
genos resilience cryptobiosis --mode stasis
```

---

## 6. Phase 2: Root Cause Diagnosis

### Diagnostic Flow
1. **Inspect Active Capsules**:
   ```bash
   genos capsule inspect "<CAPSULE_ID>" --root .genos
   ```
2. **Execute Trajectory Bisection**:
   ```bash
   genos dev bisect-agent --root .genos --dimension events --states "step_0=good" "step_n=bad"
   ```
3. **Verify CAS Chunk Health**:
   ```bash
   genos snapshot list --verify-checksums --root .genos
   ```

---

## 7. Phase 3: Step-by-Step Mitigation & Remediation

### Primary Remediation Procedure

```bash
#!/usr/bin/env bash
set -euo pipefail

remediate_cas_sync() {
    local remote_bucket="$1"
    local local_root="$2"
    aws s3 sync "$local_root/objects/" "s3://${remote_bucket}/objects/" --delete=false
}

remediate_cas_sync "genos-cas-production" ".genos"
```

### Secondary Fallback Procedure
If primary synchronization fails, reconstruct missing state via canonical replay:
```bash
genos agent replay --snapshot "<LAST_VALID_SNAPSHOT>" --root .genos
```

---

## 8. Phase 4: Verification & Recovery Validation

Perform automated health verification before restoring live traffic:

```bash
# 1. Verify HTTP Health Probe
curl -sf http://127.0.0.1:8799/health

# 2. Execute Merkle Consistency Check
genos snapshot list --verify-checksums --root .genos

# 3. Run Synthetic Verification Command
genos agent run --command "echo 'system verified'" --root .genos
```

---

## 9. Phase 5: Rollback Plan

If remediation steps introduce regression or secondary anomalies:

1. **Restore Pre-Incident Checkpoint**:
   ```bash
   genos agent restore --snapshot "<PRE_INCIDENT_SNAPSHOT_ID>" --root .genos
   ```
2. **Flush Stale Locks**:
   ```bash
   rm -f .genos/locks/*.lock
   ```
3. **Notify On-Call Lead**: Escalate to Secondary On-Call.

---

## 10. Phase 6: Post-Incident Review & Continuous Improvement

Following incident closure, complete post-mortem artifacts within 48 hours:

1. **Record Decision & Root Cause**:
   ```bash
   genos dev record-decision \
     --title "Remediation for Incident RBK-GENOS-STORE-001" \
     --evidence "incident-logs.json" \
     --assumptions "S3 bucket throttled due to unbuffered CAS multi-part upload"
   ```
2. **Record Negative Experience**:
   ```bash
   genos dev record-experience \
     --strategy "Synchronous S3 write during high-concurrency snapshotting" \
     --outcome "Connection pool exhaustion" \
     --successful false
   ```
3. **Update Runbook**: Modify thresholds or scripts based on incident findings.
