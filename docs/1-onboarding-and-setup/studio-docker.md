# Run GenOS Studio with Docker Compose

The Compose stack is a local evaluation environment, not the hardened
production topology described in the operations guide. It binds both services
to loopback, persists the SQLite database in a named volume, and waits for the
backend health check before starting Studio.

## Start

Requirements: Docker Engine 24+ with Docker Compose v2.

From the repository root:

```bash
docker compose up --build --wait
```

Open <http://localhost:3000>. The backend health endpoint is available at
<http://localhost:4000/api/health>.

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
containers expose health checks consumed by Compose.

## Boundaries

- Ports `3000` and `4000` must be available locally.
- The stack is intentionally reachable only from `127.0.0.1`.
- TLS, external identity, backups, multi-node storage, and production secrets
  are outside this local stack's scope.
- Studio currently expects the backend at `http://localhost:4000`.

For independent development with hot reload, continue to use the two-terminal
Node/Vite workflow documented in `studio/README.md`.
