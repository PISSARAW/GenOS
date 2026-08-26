# GenOS Production Deployment & Operations Architecture


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

This guide specifies the production topology, containerization, Kubernetes Helm deployment, multi-tenant sandboxing, CAS backend configurations, resource controls, and observability infrastructure for GenOS clusters.

---

## 1. Production Architecture Overview


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

The GenOS production infrastructure partitions workloads into a stateless control plane, isolated agent execution workers, and a distributed content-addressable storage (CAS) tier.

```text
                 +--------------------------------+
                 |    Ingress / Load Balancer     |
                 +--------------------------------+
                                 |
                                 v
                 +--------------------------------+
                 |    GenOS API / Control Plane   |
                 |     (StatefulSet / Ingress)    |
                 +--------------------------------+
                                 |
          +----------------------+----------------------+
          |                                             |
          v                                             v
+-----------------------+                     +-----------------------+
|  Worker Node 01       |                     |  Worker Node 02       |
|  - gVisor / bwrap     |                     |  - Firecracker / bwrap|
|  - Git Worktree Pool  |                     |  - Git Worktree Pool  |
|  - Local NVMe Cache   |                     |  - Local NVMe Cache   |
+-----------------------+                     +-----------------------+
          \                                             /
           \                                           /
            v                                         v
   +---------------------------------------------------------+
   |        Distributed CAS Cluster (MinIO / AWS S3)         |
   |        - Immutable Merkle Blobs & Snapshots             |
   |        - Event Sourcing Lineage Streams                 |
   +---------------------------------------------------------+
```

---

## 2. Multi-Tenant Sandbox Isolation


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

All subagent and capsule executions run inside hardened sandboxes to prevent host compromise and cross-tenant data leakage.

### Sandboxing Engines


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

1. **gVisor (`runsc`)**:
   - Intercepts all syscalls via a user-space kernel (Sentry).
   - Recommended for standard containerized agent tasks.
2. **Firecracker MicroVMs**:
   - Hardware-assisted virtualization with minimal kernel footprints ($< 5\text{ms}$ startup).
   - Used for untrusted code execution and adversarial benchmark workloads.
3. **Bubblewrap (`bwrap`)**:
   - Lightweight unprivileged user namespaces on Linux worker nodes for local worktree forks.

```yaml
# Kubernetes RuntimeClass for gVisor sandboxing
apiVersion: node.k8s.io/v1
kind: RuntimeClass
metadata:
  name: gvisor-sandbox
handler: runsc
```


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

---

## 3. Kubernetes Deployment with Helm


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

### Sample `values.yaml` Configuration


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

```yaml
replicaCount: 3

image:
  repository: ghcr.io/genos/runtime
  tag: "1.4.0"
  pullPolicy: IfNotPresent

resources:
  limits:
    cpu: "4000m"
    memory: "8Gi"
  requests:
    cpu: "1000m"
    memory: "2Gi"

sandboxing:
  runtimeClassName: gvisor-sandbox
  bwrapEnabled: true
  maxConcurrentWorktrees: 32

storage:
  casBackend: "s3"
  s3:
    endpoint: "https://minio.storage.internal:9000"
    bucket: "genos-cas-production"
    region: "us-east-1"
    forcePathStyle: true
  localCache:
    enabled: true
    storageClassName: "local-nvme"
    size: "100Gi"

metrics:
  enabled: true
  port: 9090
  path: "/metrics"
```

### Helm Installation Command
```bash
helm upgrade --install genos-cluster ./charts/genos \
  --namespace genos-system \
  --create-namespace \
  -f values-production.yaml
```


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

---

## 4. Content-Addressable Storage (CAS) Backends


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

GenOS persists all snapshots, repository states, and lineage logs into a content-addressable store indexed by cryptographic hashes (BLAKE3 / SHA-256).

### Supported Storage Adapters
- **Local Filesystem Store**: Optimized for single-node development (`genos-store` direct IO).
- **MinIO / Amazon S3 Store**: Scalable multi-tenant object storage with immutable write-once read-many (WORM) semantics.


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

### Storage Initialization (Rust Interface)
```rust
use genos_store::{CasConfig, CasStore, StorageBackend};


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

pub fn build_production_cas(endpoint: String, bucket: String) -> Result<CasStore, StoreError> {
    let config = CasConfig::builder()
        .backend(StorageBackend::S3 { endpoint, bucket })
        .enable_zstd_compression(true)
        .local_cache_capacity_mb(16_384)
        .build();

    CasStore::initialize(config)
}
```

---

## 5. Linux Resource Limits & cgroups v2


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

Every worker capsule is bound to dedicated cgroups v2 controllers to prevent noisy-neighbor interference:

```bash
# Example cgroup v2 capsule limit configuration
cgcreate -g cpu,memory,io,pids:/genos/capsules/cap_98f12


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

# Memory limit (4GB hard limit, 3.5GB swap limit)
echo "4294967296" > /sys/fs/cgroup/genos/capsules/cap_98f12/memory.max
echo "3758096384" > /sys/fs/cgroup/genos/capsules/cap_98f12/memory.high


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

# CPU quota (2 cores max: 200000us period)
echo "200000 100000" > /sys/fs/cgroup/genos/capsules/cap_98f12/cpu.max


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

# Max PIDs (prevent fork bombs)
echo "256" > /sys/fs/cgroup/genos/capsules/cap_98f12/pids.max
```


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

---

## 6. Health Probes & Readiness Checks


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

The target Kubernetes runtime exposes standard health endpoints. The shipped
Docker Compose backend now exposes the same paths on port `4000`, but its
implemented dependency is SQLite; CAS, worktree pools, index hydration, and
Merkle verification are not wired into this deployment.

### Endpoints
- **`/healthz` (Liveness)**: Returns `200 OK` if the process event loop is responsive.
- **`/readyz` (Readiness)**: In Compose, validates that SQLite is queryable. A future worker deployment must extend this to CAS and worktree capacity.
- **`/livez` (Startup)**: In Compose, validates SQLite startup state. Index hydration and Merkle root verification remain target-runtime checks.


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /readyz
    port: 8080
  initialDelaySeconds: 15
  periodSeconds: 5
```

---

## 7. Prometheus Metrics & Alerting


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

GenOS exposes Prometheus metrics on port `9090` at `/metrics`.

### Core Operational Metrics


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

| Metric | Type | Description | Alert Threshold |
|---|---|---|---|
| `genos_snapshots_total` | Counter | Total snapshots saved | Rate drop $> 50\%$ |
| `genos_replay_duration_seconds` | Histogram | Replay latency distribution | $p99 > 5.0\text{s}$ |
| `genos_worktree_active_total` | Gauge | Currently leased worktrees | $> 90\%$ pool capacity |
| `genos_cas_bytes_stored` | Gauge | Total storage footprint | Disk $> 85\%$ |
| `genos_mcts_rollouts_total` | Counter | MCTS trajectory iterations | N/A |
| `genos_circuit_breaker_tripped_total` | Counter | Circuit breaker activations | $> 0$ in 5 min |
| `genos_sandbox_violations_total` | Counter | Blocked unauthorized syscalls | $> 0$ (Immediate SEV-1) |

### Sample Alerting Rule (Prometheus)
```yaml
groups:
  - name: genos-alerts
    rules:
      - alert: GenOSWorktreePoolExhaustion
        expr: genos_worktree_active_total / genos_worktree_pool_capacity > 0.90
        for: 3m
        labels:
          severity: warning
        annotations:
          summary: "GenOS worker worktree pool near exhaustion (>90%)"
          description: "Worker {{ $labels.instance }} has allocated {{ $value }}% of available worktrees."


> [!WARNING]
> **Architecture Cible (Lot 4)** :
> Les composants décrits ci-dessous (déploiement Helm/Kubernetes, sandboxing gVisor/Firecracker, stockage distribué S3/MinIO, serveur Prometheus) représentent l'architecture cible théorique (Design/Roadmap). Ils ne sont pas encore implémentés dans le code de production actuel, qui utilise Docker Compose, SQLite et des worktrees Git locaux.

      - alert: GenOSReplayDivergenceDetected
        expr: increase(genos_replay_divergence_total[5m]) > 0
        labels:
          severity: critical
        annotations:
          summary: "Deterministic replay divergence detected in capsule execution"
          description: "Capsule state hash mismatch during deterministic replay."
```

