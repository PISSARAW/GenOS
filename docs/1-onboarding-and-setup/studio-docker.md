# Run GenOS Studio with Docker Compose

The Compose stack is a local, single-workspace evaluation environment, not the
hardened production topology described in the operations guide. It binds both
services to loopback, mounts one explicit host workspace, persists the SQLite
database in a named volume, and waits for the backend health check before
starting Studio.

## Start

Requirements: Docker Engine 24+ with Docker Compose v2.

From the repository root, mount the current repository:

```bash
docker compose up --build --wait
```

To inspect another repository, put its absolute path in an uncommitted `.env`
file next to `compose.yaml`:

```dotenv
GENOS_WORKSPACE_PATH=/absolute/path/to/the/workspace
GENOS_WORKSPACE_NAME=my-workspace
```

Compose mounts that path read/write at `/workspace`. Studio registers it as
`ws-local`; creating additional workspaces through the API is intentionally
disabled in this mode.

Open <http://localhost:3000>. The backend health endpoint is available at
<http://localhost:4000/api/health>. In the Compose build, Studio sends API and
SSE requests to its own origin and Nginx proxies `/api/` to the Compose
`backend:4000` service. The standalone Vite development server uses
`http://localhost:4000` instead.

On the first boot of an empty database, the backend generates a random
administrator token and prints it once. Retrieve and save it before signing in:

```bash
docker compose logs backend | grep -A 2 'Generated one-time administrator token'
```

Alternatively set a strong `GENOS_ADMIN_TOKEN` in the uncommitted `.env` file
before the first boot. No administrator credential is embedded in Studio or
the backend image.

Inspect status and logs with:

```bash
docker compose ps
docker compose logs --follow
```

Stop the services without deleting data:

```bash
docker compose down
```

The SQLite database remains in the `genos_genos-data` named volume. Deleting
that volume is destructive and requires an explicit command; the normal stop
command above preserves it.

## Rebuild after changing code

```bash
docker compose up --build --wait
```

The frontend is compiled into a small nginx image. The backend runs as the
unprivileged `node` user and stores its database at `/data/genos.db`. Both
containers expose health checks consumed by Compose and run with
`no-new-privileges`.

The Dockerfiles pin their Node and nginx base-image manifests by digest so a
tag cannot silently change a build. The human-readable tags remain alongside
the digests for maintenance. Review and refresh both the tag and digest
together when applying upstream security updates; no automated image updater
is configured yet.

## Boundaries

- Ports `3000` and `4000` must be available locally.
- The stack is intentionally reachable only from `127.0.0.1`.
- It manages exactly one bind-mounted workspace and is unsuitable for hosting
  untrusted repositories or users.
- TLS, external identity, backups, multi-node storage, and production secrets
  are outside this local stack's scope.
- The production Compose Studio image uses same-origin `/api` requests; only
  the standalone Vite development server expects `http://localhost:4000`.
- The bundled Codex adapter keeps normal approvals and sandboxing. The unsafe
  bypass can only be enabled explicitly with `GENOS_CODEX_UNSAFE_BYPASS=1`;
  use it solely for a disposable, trusted workspace. It is disabled by default.
- The backend image does not bundle the Codex CLI. Agent execution therefore
  requires a separately supplied executor; workspace browsing and Studio APIs
  remain available without one.

For independent development with hot reload, continue to use the two-terminal
Node/Vite workflow documented in `studio/README.md`.
