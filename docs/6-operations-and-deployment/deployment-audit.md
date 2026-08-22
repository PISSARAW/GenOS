# Deployment Audit

**Audit date:** 2026-08-22
**Scope:** Docker Compose deployment, backend container probes, Studio browser/API routing, and the production deployment documentation.

## Result

The repository provides a hardened, single-workspace Docker Compose deployment
for local or trusted-network use. It is not yet a Kubernetes production
deployment: no Helm chart, external identity integration, TLS termination,
distributed CAS, backup procedure, or worker sandbox is shipped in this
repository. The operations architecture remains a target design.

## Findings and remediation

| Finding | Evidence | Status |
|---|---|---|
| Readiness was only an HTTP process check | Compose and `backend/Dockerfile` probed `/api/health`; that endpoint did not verify storage | Fixed: `/readyz` and `/livez` verify SQLite with `SELECT 1`; `/healthz` remains process-only |
| Production browser requests were pinned to `localhost:4000` | `studio/src/api/client.ts` used an absolute API URL | Fixed: production builds use same-origin requests; Nginx proxies `/api/` to `backend:4000` |
| Remote origins had no deployment configuration | CORS origins were a hard-coded local list | Fixed: `GENOS_ALLOWED_ORIGINS` extends the safe local defaults |
| Shutdown did not drain the worker or close SQLite | `backend/server.js` had no signal handlers | Fixed: SIGTERM/SIGINT stop the worker and close the database after the HTTP server drains |

## Verification

Run these checks from the repository root:

```bash
docker compose config --quiet
(cd backend && node test_deployment_health.js)
(cd studio && npm ci && npm run build)
```

The Compose stack remains intentionally bound to loopback by default. Before
placing it behind a public ingress, configure `GENOS_ALLOWED_ORIGINS`, provide
TLS and external authentication, and establish encrypted backups for the
SQLite volume. Do not enable `GENOS_CODEX_UNSAFE_BYPASS` for a deployed or
untrusted workspace.
