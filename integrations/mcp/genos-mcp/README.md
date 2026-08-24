<p align="center">
  <img src="../../../assets/brand/genos-logo.png" width="112" alt="GenOS official logo">
</p>

# genos-mcp

`genos-mcp` is a Model Context Protocol (MCP) server that exposes the GenOS
agent runtime to MCP clients such as OpenAI Codex. It wraps the `genos` CLI
behind ten canonical tools and ships two transports: stateless JSON-RPC over
STDIO and Streamable HTTP.

## Tools

`genos_orchestrate`, `genos_delegate_worker`, `genos_worker_inbox`,
`genos_worker_publish`, `genos_report_progress`, `genos_trinity_launch`,
`genos_a_team_preview`, `genos_organization_state`, `genos_change_strategy`,
`genos_change_organization`.

Tool schemas live in `src/lib.rs`; per-tool semantics are documented in the
[MCP tools reference](../../docs/4-interfaces/mcp-tools-reference.md).

## Build and run

```bash
cargo build -p genos-mcp
genos-mcp                 # STDIO transport (default)
genos-mcp --transport http --bind 127.0.0.1:8799
```

HTTP transport requires a non-empty `GENOS_MCP_TOKEN` and authenticates every
request against it.

## Environment

| Variable | Default | Description |
|---|---|---|
| `GENOS_WORKSPACE_ROOT` | current directory | Workspace the server operates on. |
| `GENOS_EXECUTION_MODE` | — | Worker authority mode forwarded to the CLI. |
| `GENOS_MCP_TOKEN` | — | Bearer token, mandatory for HTTP transport. |
| `GENOS_MCP_LEASE` | off | Time-boxed lease unlocking `genos_run`. |
| `GENOS_MCP_EXPOSE_ALL` | off | Expose tools beyond the canonical ten. |
| `GENOS_ALLOWED_COMMANDS_JSON` | `[]` | Allow-list for `genos_run` commands. |

## Tests

```bash
cargo test -p genos-mcp
```
