# ADR-0021: Protocol Interoperability and OpenAI Codex Integration

- Status: Accepted
- Date: 2026-08-15

## Context

GenOS must be usable by existing agent environments without embedding product-
specific logic in its runtime. It must also be able to execute an agent with an
interchangeable model provider. These are different integration directions:

```text
Codex -> GenOS tools -> GenOS runtime
GenOS runtime -> OpenAI model provider -> model response
```

Treating OpenAI Codex, ChatGPT, or an OpenAI API model as the same integration
would couple product behavior, model inference, and GenOS lifecycle semantics.
It would also make snapshots and experiments less portable.

OpenAI Codex clients support Model Context Protocol (MCP) servers. A GenOS MCP
server can therefore expose the canonical lifecycle operations to Codex without
requiring Codex-specific behavior in `genos-core` or `genos-runtime`.

## Decision

GenOS will define one provider-neutral protocol surface for its public lifecycle
operations. Adapters translate that surface into MCP tools, HTTP endpoints,
SDK methods, and provider-specific function schemas.

The first supported native agent-environment targets are OpenAI Codex and
Claude Code through the same GenOS MCP server. Codex is an environment that
uses GenOS; it is not a model provider and is not part of an agent genome.

The protocol surface begins with the canonical operations:

```text
create   snapshot   restore   fork   run
inspect  diff       lineage   replay merge
```

The MCP adapter must support both local STDIO and streamable HTTP transports.
Transport, authentication, product configuration, and presentation concerns
remain outside the protocol and runtime crates.

The architecture therefore separates:

```text
OpenAI Codex integration -> GenOS MCP adapter -> GenOS protocol -> runtime
OpenAI model provider    -> model adapter     -> GenOS model contract
ChatGPT integration      -> product adapter   -> GenOS protocol
```

Codex-specific installation may configure a project-scoped MCP server, but no
configuration is shipped until an executable `genos-mcp` server exists.

## Compatibility contract

All protocol adapters must preserve the same operation names, versioned input
and output schemas, identifiers, error categories, and lifecycle semantics.
Adapters may add transport metadata but may not reinterpret runtime behavior.

A client compatibility matrix distinguishes:

| Level | Requirement |
| --- | --- |
| Model | Text inference |
| Agent | Structured output and tool calls |
| GenOS native | Direct access to GenOS lifecycle tools through MCP or an equivalent protocol adapter |

OpenAI Codex is a target for the GenOS-native level through MCP.

## Consequences

- Codex and Claude Code can share one GenOS tool implementation.
- OpenAI model support can evolve independently from Codex product support.
- Core and runtime code remain free of product-name conditionals.
- A future ChatGPT integration does not imply or depend on Codex integration.
- The protocol and MCP server require production code, schemas, tests, and
  installation documentation before compatibility can be advertised as
  implemented.

