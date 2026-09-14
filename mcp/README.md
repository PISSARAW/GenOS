# genos-mcp

Standalone [Model Context Protocol](https://modelcontextprotocol.io) stdio server for
[GenOS](https://github.com/PISSARAW/GenOS). It exposes a leased catalogue of GenOS tools to
MCP clients (Claude Code, Cursor, opencode, custom agents) with argument validation,
bounded output and a local circuit breaker.

The package runs on its own for discovery and CLI/orchestrator dispatch. When the GenOS
repository is available, it additionally bridges strategy/primitive tools to the backend.

## Install

```bash
npm install genos-mcp
```

Or run it from a checkout:

```bash
node mcp/index.js
```

## MCP client configuration

```json
{
  "mcpServers": {
    "genos": {
      "command": "npx",
      "args": ["genos-mcp"],
      "env": {
        "GENOS_MCP_LEASE": "genos_snapshot,genos_replay,genos_execute_primitive"
      }
    }
  }
}
```

When running inside the GenOS repository, point the client at the local entry instead:

```json
{
  "mcpServers": {
    "genos": {
      "command": "node",
      "args": ["mcp/index.js"],
      "env": { "GENOS_MCP_LEASE": "genos_snapshot,genos_replay,genos_execute_primitive" }
    }
  }
}
```

## Backend resolution

The server locates the GenOS repository by looking for `Cargo.toml`, `backend/package.json`
and `shared/toolDefinitions.json`:

1. `GENOS_REPO_ROOT` if it points to an existing directory;
2. walking up from the package directory and the current working directory.

When found, the tool catalogue (`shared/toolDefinitions.json`), the schema contract
(`backend/src/services/mcpContract.js`) and strategy execution
(`backend/src/services/mcpStrategyTools.js`) are loaded from the repository. Otherwise the
bundled catalogue and schema contract are used, and strategy tools return an explicit
`backend_unavailable` error instead of failing silently.

## Environment variables

| Variable | Purpose |
| :--- | :--- |
| `GENOS_REPO_ROOT` | Explicit path to the GenOS repository. |
| `GENOS_MCP_LEASE` | Allow-list of visible tools (`snapshot,replay,...`; prefix `genos_` is optional). |
| `GENOS_MCP_DISABLED_TOOLS` | Deny-list that always wins over the lease. |
| `GENOS_MCP_LEASE_EXPIRES_AT` | Epoch milliseconds after which the lease is rejected. |
| `GENOS_MCP_EXPOSE_ALL` | Expose the full catalogue (blocked in `NODE_ENV=production`). |
| `GENOS_MCP_ALLOW_UNSAFE_EXPOSE_ALL` | Allows full exposure even in production. |
| `GENOS_MCP_TOOL_TIMEOUT_MS` | Per-tool timeout, bounded to 30 minutes (default `30000`). |
| `GENOS_BIN` | Path to the `genos` CLI binary. |
| `GENOS_ORCHESTRATOR_BRIDGE` | Path to `backend/bin/genos-orchestrate.cjs`. |

Full exposure requires a lease in production; prefer an explicit lease per worker.

## Tools

- **Workspace / CLI** (`genos_snapshot`, `genos_replay`, `genos_capsule_create`, `genos_merge`,
  `genos_audit`, `genos_biomimicry`, `genos_v2_*`): dispatched to the Rust `genos` CLI, or to a
  deterministic Node bridge when the binary is absent.
- **Strategy** (`genos_strat_*`, `genos_execute_primitive`, ...): requires the GenOS backend.
- **Orchestration** (`genos_orchestrate`, `genos_delegate_worker`, ...): dispatched to
  `backend/bin/genos-orchestrate.cjs`.

## Tests

```bash
npm test           # lease, identity and bundled/backend contract parity
npm run test:smoke # standalone server (bundled catalogue + schema contract)
```

## License

Apache-2.0. See the repository [`LICENSE`](https://github.com/PISSARAW/GenOS/blob/v3/LICENSE).
