# GenOS MCP server

`genos-mcp` exposes the ten canonical GenOS lifecycle operations plus sixteen
software-development trajectory tools to OpenAI Codex, Claude Code, and other MCP clients. It supports local STDIO and stateless
Streamable HTTP transports.

The development catalog covers hypothesis-driven diagnosis, adaptive solve
trajectories, causal decisions/blame, negative knowledge, adversarial review,
future-world CI, agent bisect, repository genomes, and compiled memory. These
objects are persisted under `.genos/dev` so later agents can reuse both winning
and failed experience.

See [the integration guide](../../../docs/integrations/CODEX_MCP.md) for build,
configuration, security, and troubleshooting instructions.
