# GenOS Backend

The GenOS backend is the Express + SQLite control plane behind GenOS Studio. It
persists workspaces, agents, telemetry, traces, experiments and security state
in a single local database, exposes the REST API consumed by Studio, and hosts
the bundled agent runtime adapter used when deploying agents.

## Requirements

- Node.js 20.19+ or 22.12+

## Local run

From this directory:

```bash
npm install
npm start
```

The server listens on `http://localhost:4000` (override with `PORT`).
Health probe: `GET /api/health`.

On first boot the backend creates `genos.db`, applies the schema (67 tables)
and seeds a bootstrap administrator access key. The generated one-time admin
token is printed to the console; set `GENOS_ADMIN_TOKEN` instead to choose it.
A default local login (`admin`, role admin) is also seeded unless
`GENOS_ADMIN_PASSWORD` provides another password.

## Layout

```
server.js              HTTP entrypoint
src/
  app.js               Express app: middleware and route mounting
  routes/              One router per resource (workspaces, agents, ...)
  controllers/         Request handlers
  services/            Domain logic (model routing, snapshots, MCP, RAG, ...)
  middleware/          RBAC, CSRF and security enforcement
  db/                  Schema, migrations and seed data
bin/                   Bundled runtime adapters (agent runtime, orchestrator,
                       pre-tool policy) launched as child processes
```

The full environment variable reference lives in
[docs/1-onboarding-and-setup/environment-variables.md](../docs/1-onboarding-and-setup/environment-variables.md).

## Authentication

All privileged requests carry an access key or session token through the
`Authorization: Bearer <token>` / `X-Access-Key` headers. Roles are
`admin`, `operator` and `viewer`; mutating requests must also present the
anti-CSRF token minted by `GET /api/security/csrf`. See the Studio README for
the client-side flow.

## Tests

The test suite is a set of plain Node scripts that spin up the server on an
ephemeral port:

```bash
npm test
```
