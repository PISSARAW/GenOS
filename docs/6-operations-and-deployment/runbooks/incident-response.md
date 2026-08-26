# Runbook: Incident Response & Causal Post-Mortems

This runbook defines the operational protocol for triaging, mitigating, and investigating production incidents across GenOS clusters, with specialized workflows for causal replay diagnostics and blameless post-mortem generation.

---

## 1. Severity Levels & SLA Matrix

| Severity | Definition | Target Response (MTTA) | Target Mitigation (MTTR) | Escalation Channel |
|---|---|---|---|---|
| **SEV-1** | System-wide outage, CAS state corruption, or sandbox escape. | $< 5$ minutes | $< 30$ minutes | PagerDuty / `@genos-lead-oncall` |
| **SEV-2** | Deterministic replay divergence, worktree exhaustion, or $p99 > 5\text{s}$. | $< 15$ minutes | $< 2$ hours | Slack `#genos-ops-urgent` |
| **SEV-3** | Non-blocking agent task failures or single-node worker degradation. | $< 1$ hour | $< 8$ hours | Slack `#genos-ops` |
| **SEV-4** | Minor anomalies, non-critical metric spikes, documentation issues. | Next business day | $< 72$ hours | Jira / GitHub Issues |

---

## 2. Incident Triage Protocol & Roles

Upon declaration of a SEV-1 or SEV-2 incident, establish the incident command structure:

```text
               +-----------------------------------+
               |     Incident Commander (IC)       |
               |  Coordinates triage & mitigations |
               +-----------------------------------+
                                 |
         +-----------------------+-----------------------+
         |                                               |
         v                                               v
+-------------------------------+             +-------------------------------+
|     Operations Lead (Ops)     |             |    Communications Lead (Comms)|
|  Executes runbooks & patches  |             |  Updates status page & users  |
+-------------------------------+             +-------------------------------+
```

### Initial Triage Steps (First 5 Minutes)
1. **Acknowledge Incident**: Page on-call responder and open war room bridge (`#incident-YYYYMMDD-id`).
2. **Assess Blast Radius**: Inspect Prometheus metrics and query active worker nodes:
   ```bash
   kubectl get pods -n genos-system -l app.kubernetes.io/name=genos-runtime
   ```
3. **Verify CAS Integrity**: Execute fast health probe:
   ```bash
   genos snapshot list --root .genos
   ```

---

## 3. Immediate Mitigation Workflows

### Scenario A: Replay Divergence or Rogue Agent Loop
Trip the global circuit breaker to halt autonomous mutations:
```bash
genos resilience circuit-breaker --branch-id "branch_divergent_01"
```

### Scenario B: Worktree Pool Starvation
Drain stalled workers and prune stale locks:
```bash
# Gracefully evict stuck worker pod
kubectl drain <node-name> --delete-emptydir-data --ignore-daemonsets

# Force prune stale worktrees across worker pool
git -C /var/lib/genos/repo worktree prune --verbose
```

### Scenario C: CAS Write Latency Spike
Engage offline stasis mode while storage recovers:
```bash
genos resilience cryptobiosis --mode offline
```

---

## 4. Causal Replay Investigation Workflow

GenOS provides built-in causal replay tools to isolate the exact event sequence triggering an anomaly without modifying production state.

```text
+-----------------------+     +-----------------------+     +-----------------------+
| 1. Export Trajectory  | --> | 2. Seed Counterfactual| --> | 3. Perturb & Bisect   |
| Extract failing trace |     | Load trace in sandbox |     | Isolate root causal   |
| from CAS event store  |     | without network access|     | event sequence        |
+-----------------------+     +-----------------------+     +-----------------------+
```

### Step 1: Analyze Failing Trajectory
```bash
genos dev analyze-trajectory \
  --step "step_0=good" "step_n=divergent"
```

### Step 2: Launch Causal Replay Incident Experiment
```bash
genos experiment incident \
  --snapshot "production@incident-42" \
  --evidence "evidence.yaml" \
  --search-plan "search.yaml" \
  --root .genos
```

### Step 3: Counterfactual Perturbation
Isolate the root cause by perturbing suspect events and observing if the divergence reproduces:
```rust
use genos_eval::{CausalHarness, PerturbationPlan};

pub async fn diagnose_incident(trace_path: &str) -> Result<DiagnosisReport, DiagnosticError> {
    let harness = CausalHarness::from_trace_file(trace_path).await?;
    let plan = PerturbationPlan::isolate_decision_points();
    harness.evaluate_divergence(plan).await
}
```

---

## 5. Blameless Post-Mortem Protocol

A post-mortem document must be authored within 48 hours for all SEV-1 and SEV-2 incidents.

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title] (Incident ID: INC-XXXX)

## Incident Overview
- **Date / Time**: YYYY-MM-DD HH:MM UTC
- **Severity**: SEV-1 / SEV-2
- **Incident Commander**: @username
- **Operations Lead**: @username
- **Total Duration (MTTR)**: XX minutes
- **Impact Summary**: [Description of impacted workloads and capsules]

## Timeline (UTC)
- **10:00** - Alert `GenOSReplayDivergenceDetected` fired in Prometheus.
- **10:04** - On-call acknowledged and declared SEV-1 incident.
- **10:12** - Circuit breaker tripped on cluster `prod-us-east-1`.
- **10:22** - Causal replay identified race condition in worktree lock release.
- **10:35** - Patch deployed; worktree pool drained and restarted.
- **10:45** - Synthetic verification replays passed; all systems green.

## Root Cause Analysis (5-Whys)
1. *Why did replay diverge?* State hash differed from snapshot record.
2. *Why did state hash differ?* A temporary lock file was left uncommitted in worktree.
3. *Why was lock file present?* The subagent worker was killed by OOM without cleanup.
4. *Why did worker OOM?* Memory cgroup was set to 2GB while task loaded a 3GB dataset.
5. *Why was task allowed to load 3GB?* Cgroup memory limit was lower than the dataset validator threshold.

## Corrective Actions & Preventative Items
- [ ] **Action 1**: Align cgroup memory boundaries with dataset validation parser (Owner: @dev, Priority: P0).
- [ ] **Action 2**: Add automated worktree orphan file detector to pre-replay hook (Owner: @ops, Priority: P1).
- [ ] **Action 3**: Add alert for worker pod ungraceful terminations (Owner: @sre, Priority: P1).
```

