# Use GenOS from OpenAI Codex

OpenAI Codex consumes GenOS as an MCP tool server. This is separate from using
an OpenAI API model as the cognitive provider of a GenOS agent.

```text
OpenAI Codex -> MCP -> genos-mcp -> GenOS protocol -> genos CLI/runtime
```

## Project-scoped setup

This repository includes [`.codex/config.toml`](../../.codex/config.toml).
After trusting and opening the project in Codex, restart the client so it loads
the `genos` MCP server. The first start may compile the Rust binary.

Verify the configuration from a terminal:

```bash
codex mcp list
```

In the Codex terminal UI or composer, use `/mcp` to inspect the connected server
and its ten `genos_*` tools.

The checked-in configuration runs:

```bash
cargo run --quiet -p genos-mcp -- stdio
```

For faster startup, build both executables and point `GENOS_BIN` at the `genos`
binary in a personal Codex configuration:

```bash
cargo build -p genos-cli -p genos-mcp
```

```toml
[mcp_servers.genos]
command = "/absolute/path/to/genos-mcp"
args = ["stdio"]
cwd = "/absolute/path/to/GenOS"
default_tools_approval_mode = "writes"

[mcp_servers.genos.env]
GENOS_BIN = "/absolute/path/to/genos"
GENOS_WORKSPACE_ROOT = "/absolute/path/to/GenOS"

[mcp_servers.genos.tools.genos_run]
approval_mode = "prompt"
```

## Streamable HTTP

Start the server on the loopback interface:

```bash
cargo run -p genos-mcp -- http --bind 127.0.0.1:8799
```

Then configure a Codex client with:

```toml
[mcp_servers.genos_http]
url = "http://127.0.0.1:8799/mcp"
default_tools_approval_mode = "writes"
```

The current HTTP transport is stateless and intentionally has no built-in
authentication. Keep it bound to loopback. Any remote deployment must place it
behind TLS and an authenticated gateway before exposing it to a network.

## Safety model

- Read-only tools (`inspect`, `diff`, `lineage`, and `replay`) are annotated as
  read-only.
- State-changing tools trigger Codex's `writes` approval policy.
- `genos_run` is always configured to prompt. It executes only inside the
  capsule's isolated world, consumes one budget step, records an event, and may
  change files in that world.
- The server never interpolates tool arguments into a shell command when it
  invokes the GenOS CLI.

## Troubleshooting

- If startup times out, run `cargo build -p genos-mcp` once or raise
  `startup_timeout_sec`.
- If the server cannot find GenOS, set `GENOS_BIN` to the absolute `genos`
  executable path.
- If data appears under the wrong project, set `GENOS_WORKSPACE_ROOT` and use
  an explicit `root` argument for the tool call.
- Run `cargo test -p genos-protocol -p genos-mcp` to verify schemas, dispatch,
  STDIO framing, and HTTP handling.

Codex supports project-scoped `.codex/config.toml`, local STDIO MCP servers,
Streamable HTTP servers, server instructions, and per-tool approval policies;
see the [official OpenAI MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli).

