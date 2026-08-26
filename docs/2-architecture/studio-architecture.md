# Studio Architecture

GenOS Studio is the browser control plane of the project: a single-page
React application that wraps the backend REST API and SSE streams into an
operational dashboard. This page describes how the frontend is built and
wired. The user-facing behavior is covered in the
[Studio User Guide](../3-features-and-domain/studio-user-guide.md).

## Stack

| Concern | Choice |
|---|---|
| UI runtime | React 19 + TypeScript (strict) |
| Build | Vite 8 (`tsc -b && vite build`), dev server on port 5173 |
| State | Zustand stores (`useGenOSStore`, `useToastStore`) |
| Live data | Fetch-based SSE streams + bounded polling fallback |
| Workflow canvas | `@xyflow/react` (ReactFlow) in Studio Builder |
| Charts / editor / command palette | recharts, Monaco, cmdk |
| Lint / rules | oxlint; house rules â‰¤400 lines per file, â‰¤3 function parameters |

## Source layout

```
studio/src/
  App.tsx               Hash router (#/<view>), topbar, sidebar, HALT ALL
  api/
    http.ts             Request pipeline shared by every call
    client.ts           coreApi (auth, agents, workspaces...) + ensureTenantScope
    endpoints.ts        extendedApi (traces, evals, RAG, releases, modules...)
  store/
    useGenOSStore.ts    Global agent/trace state + initializeLiveSync
    useToastStore.ts    Toast queue (max 5, 4 s auto-dismiss)
  components/
    RBAC_Gate.tsx       Login screen and privilege gate
    GodModeTerminal.tsx, Dashboard.tsx, ... one folder per module group
```

Every sidebar entry maps to a key of `StudioView` in `App.tsx`; navigation is
a hash change, so deep links like `#/terminal` survive reloads.

## Request pipeline (`api/http.ts`)

All API calls go through a single pipeline:

1. **Base URL**: `VITE_API_BASE_URL` if set, otherwise `http://localhost:4000`
   in dev and same-origin in production builds.
2. **Headers on every call**: `Authorization: Bearer <token>` +
   `X-Access-Key` from `localStorage.genos_auth_token`,
   `X-Organization-Id` / `X-Project-Id` when a tenant scope exists,
   always with `credentials: 'omit'`.
3. **Anti-CSRF**: mutating methods first call `ensureCsrfToken()`, which
   fetches and caches the token minted by `GET /api/security/csrf`. The client
   never invents a CSRF value.
4. **Errors**: non-OK responses throw with the message extracted from the
   backend's `{error:{message}}` envelope.

SSE cannot reuse native `EventSource` because it cannot attach headers;
`subscribeApiEventStream()` performs a manual `fetch` stream read with the
same header set and parses `data:` frames.

## State and live sync

- `useToastStore` is the feedback bus for API successes/failures.
- `useGenOSStore.initializeLiveSync()` runs once at startup:
  1. initial fetch of the agent list;
  2. subscription to `/api/telemetry` (SSE): `AGENT_SPAWNED` /
     `AGENT_STATE_CHANGE` trigger a debounced refetch, events with an
     `agentId` append trace spans;
  3. a 4 s polling fallback keeps the fleet fresh if the stream dies.
- The topbar polls `GET /api/status` every 5 s for the active-agent count.

## Authentication and authorization

`RBAC_Gate` wraps privileged controls and presents the sign-in experience:
password login (`POST /api/auth/login`) or access-token unlock
(`POST /api/auth/verify-token`). Valid sessions are stored in localStorage so
reloads stay authenticated; anonymous visitors can browse read-only, and any
elevated action reopens the gate. Backend enforcement (roles, permissions,
CSRF) is described in the [backend REST API reference](../4-interfaces/backend-api-reference.md).

## Deployment

- **Dev**: `npm run dev` in `studio/` with the backend running on :4000.
- **Docker**: the Compose stack serves the built assets through nginx and
  proxies same-origin `/api` to the backend service, so browsers never need
  to reach `localhost` themselves (see `nginx.conf`, `compose.yaml`).
- Environment variables consumed by Studio are listed in the
  [environment variable reference](../1-onboarding-and-setup/environment-variables.md).

## Tests

Plain Node scripts run against a live backend:

```bash
node test_e2e_api_client.mjs      # typed client, endpoint schemas, modules
node test_static_compliance.mjs   # source-level house rules audit
npm run lint                      # oxlint
```


### Component Modularity (Added in Lot 2)
The studio/src/components/ directory is highly modularized to respect the 400-line limit rule. It includes specialized subdirectories: gent-profile/, rena/, deployment/, genome/, memory/, esilience/, sandbox/, swarm/, and 	imeline/.
