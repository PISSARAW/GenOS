# Studio Navigation and Backend Evidence Audit

**Audit date:** 2026-08-22
**Scope:** `studio/src/App.tsx`, dashboard and cross-view navigation, the
centralized Studio API client, and Express route mounts.
**Method:** static source tracing plus the repository's frontend build and
backend contract checks. This is an evidence report, not a claim of a
browser-driven end-to-end run.

## Result

The active Studio navigation is internally wired: all 24 unique sidebar
destinations in `studio/src/App.tsx:157-249` have matching render branches in
`studio/src/App.tsx:283-311`. The dashboard adds `Workspaces` and `Active
Experiments` (`studio/src/components/Dashboard.tsx:76-80`), and selecting an
agent reaches `Agent Profile` (`studio/src/App.tsx:296`). The app is a local
state-driven single-page surface; it has no URL router, so browser refresh,
deep links, and browser back/forward do not preserve the selected view.

## Navigation findings

| Area | Evidence | Finding |
|---|---|---|
| Sidebar | `App.tsx:157-249` | 24 unique clickable destinations are declared. |
| Render coverage | `App.tsx:283-311` | Every sidebar destination has a corresponding render branch. |
| Secondary navigation | `Dashboard.tsx:76-80`; `App.tsx:296` | Workspaces, Active Experiments, and Agent Profile are reachable outside the sidebar. |
| Legacy branches | `App.tsx:300`, `App.tsx:302` | `topology` and `editor` render branches have no current navigation action; they are unreachable through the shipped UI. |
| Deep linking | `studio/src/main.tsx`, `studio/src/App.tsx:54-55` | No route or URL-state integration; startup always selects `home`. |

The unreachable branches are low-risk cleanup candidates. Removing them or
adding an explicit navigation entry should be a separate product decision,
because they may represent planned legacy surfaces.

## Backend evidence

The API client defines the backend contract in `studio/src/api/client.ts:124-382`.
The corresponding Express mounts are present in `backend/src/app.js:83-118`:

| Studio surface | Client evidence | Backend evidence |
|---|---|---|
| Studio Builder | `client.ts:178-201` | `/api/workflows`, `/api/prompts`, and `/api/traces` mounted at `app.js:84-87`; route handlers in `workflowRoutes.js`, `promptRoutes.js`, and `traceRoutes.js`. |
| Dashboard / runtime | `client.ts:306-311`, `useGenOSStore.ts:181-213` | `/api/status`, `/api/health`, `/api/dashboard`, `/api/achievements`, and SSE `/api/telemetry` mounted at `app.js:113`. |
| Arena and evaluation | `client.ts:313-326` | `/api/evaluation` and `/api/arena` mounted at `app.js:100,104`; genome decision routes are mounted by `lineageRoutes.js`. |
| MCP Sandbox | `client.ts:271-280,328-331` | Tool and MCP routes mounted by `app.js:116`; handlers include dry-run, schema, metrics, test, execute, and circuit-breaker paths. |
| Swarm / resilience | `client.ts:264-269,333-345` | `/api/swarm` and `/api/resilience` mounted at `app.js:99,101`. |
| Genome / memory | `client.ts:246-254,347-359` | Lineage/genome and memory route aggregators mounted at `app.js:102,115`. |
| Workspace timeline | `client.ts:166-176,361-367` | `/api/workspaces` mounted at `app.js:84`; diff, bisect, snapshots, rollback preview, and restore routes exist in `workspaceRoutes.js`. |
| Compliance / platform safety | `client.ts:295-304,369-382` | Compliance, IDE, schema, and platform routes mounted at `app.js:103-108`. |

The production request path is also consistent with the client: production
builds use same-origin API URLs (`studio/src/api/client.ts:6-7`) and Nginx
proxies `/api/` to `backend:4000` (`studio/nginx.conf:13-25`). The Compose
backend health check uses `/readyz` (`compose.yaml:29-38`), while the
application exposes liveness/readiness/startup probes in `backend/src/app.js:50-58`.

## Verification receipts

Run from the repository root unless noted:

| Check | Result | Evidence |
|---|---|---|
| `cd studio && npm run build` | PASS | TypeScript and Vite production build completed; 2,634 modules transformed. |
| `cd studio && node test_static_compliance.mjs` | FAIL (existing constraints) | `studio/src/api/client.ts` is 404 lines; `studio/src/index.css` is 404 lines and contains one `linear-gradient`. |
| `node backend/test_deployment_health.js` | PASS | Liveness, SQLite readiness, and startup probe contract passed. |
| `node backend/test_studio_control_plane.js` | PASS | Workflow graph validation and seven control-plane tables passed. |
| `docker compose config --quiet` | PASS | Compose configuration parses successfully. |

The static-compliance failure is recorded rather than silently changed because
this audit did not authorize a broad frontend refactor, and the failing files
are outside the navigation wiring itself. The backend HTTP listener could not
be bound in the restricted audit environment (`listen EPERM`); runtime route
claims above are therefore grounded in source mounts and the passing backend
contract/probe tests.


> [!SUCCESS]
> **Mise à jour (Audit Lot 2)** :
> L'ensemble des problèmes soulevés dans cet audit ont été résolus. Le routeur par hash (#/terminal, etc.) est implémenté et survit aux rechargements. Le code frontend respecte désormais à 100% la règle des 400 lignes et l'absence totale de dégradés (0 gradient). Test PASS.
