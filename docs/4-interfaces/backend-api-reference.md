# Backend REST API Reference

Complete inventory of the HTTP API served by the backend on `PORT` (default
`4000`). Generated from the Express routers in `backend/src/routes/`.

## Conventions

- **Authentication**: every privileged call carries an access key or session
  token via `Authorization: Bearer <token>` and/or `X-Access-Key`.
- **Anti-CSRF**: mutating calls must echo the token minted by
  `GET /api/security/csrf` in the `X-CSRF-Token` header.
- **Tenant scope**: organization/project-scoped writes expect
  `X-Organization-Id` and `X-Project-Id` headers (`requireTenantScope`).
- **Roles**: `admin`, `operator`, `viewer`. The *Permission* column lists the
  guard applied by the router; unmarked read endpoints are public or
  viewer-level.

## Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Liveness probe used by Compose and Studio. |

## Authentication

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with `{username, password}` or `{token}`. |
| POST | `/api/auth/login/password` | Password login only; returns a session token. |
| POST | `/api/auth/verify-token` | Validate an access key; returns role and permissions. |
| POST | `/api/auth/verify-override` | Alias of verify-token for override keys. |
| GET | `/api/auth/session` | Resolve the caller from headers. |
| GET | `/api/auth/keys` | List access keys. Admin only. |
| POST | `/api/auth/keys` | Mint an access key. Admin only. |

## Security

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/security/csrf` | â€” | Issue an anti-CSRF token. |
| GET | `/api/security/status` | â€” | Current security posture. |
| POST | `/api/security/kill-switch` | emergency_kill | Trigger the global kill switch. |
| POST | `/api/security/kill-switch/reset` | admin role | Reset the kill switch. |
| POST | `/api/halt` | emergency_kill | Global halt of all agents. |

## Workspaces

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/workspaces` | â€” | List workspaces (paginated). |
| POST | `/api/workspaces` | workspace:write | Create a workspace. |
| GET | `/api/workspaces/:id` | â€” | Workspace details. |
| GET | `/api/workspaces/:id/files` | â€” | Workspace file tree. |
| GET | `/api/workspaces/diff` | â€” | Diff two references. |
| POST | `/api/workspaces/bisect` | workspace:write | Causal bisection over snapshots. |
| GET | `/api/workspaces/:id/snapshots` | â€” | Snapshot history. |
| POST | `/api/workspaces/:id/snapshots` | workspace:write | Capture a snapshot. |
| POST | `/api/workspaces/:id/restore` | workspace:write | Restore to a snapshot step. |
| GET | `/api/workspaces/:id/rollback-preview` | â€” | Preview an atomic rollback step. |
| POST | `/api/workspaces/rollback` | workspace:write | Apply an atomic rollback step. |

## Agents and deployment

Mounted under `/api`: deployment lives on `/deploy`, agents on `/agents`.

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/deploy` | workspace:write | Deploy an agent mission. |
| GET | `/api/deploy/trinity` | â€” | List trinity worlds. |
| POST | `/api/deploy/trinity` | workspace:write | Launch a trinity workflow. |
| GET | `/api/agents` | â€” | List agents (paginated). |
| GET | `/api/agents/history` | â€” | Historical runs. |
| GET | `/api/agents/:id/dossier` | â€” | Full dossier for one agent. |
| POST | `/api/agents/spawn` | workspace:write | Spawn an agent. |
| POST | `/api/agents/:id/start` Â· `/stop` | workspace:write | Start/stop an agent. |
| DELETE | `/api/agents/:id` | workspace:write | Delete an agent. |
| POST | `/api/agents/bulk-stop` Â· `/bulk-delete` | workspace:write | Fleet operations. |
| POST | `/api/agents/:id/ping` | â€” | Liveness ping. |
| POST | `/api/agents/:id/subscribe` | â€” | Subscribe to agent events. |
| POST | `/api/agents/:id/events` | workspace:write | Ingest an agent event. |
| GET | `/api/agents/:id/workers/garage` | â€” | Worker roster of an orchestrator. |
| POST | `/api/agents/:id/workers/:workerId/dispatch` | workspace:write | Dispatch a worker. |
| GET/POST | `/api/agents/:id/strategy-contract(s)` | write on POST | Strategy contract selection. |
| GET | `/api/agents/:id/execution-runs` (+`/latest`) | â€” | Execution run history. |
| POST | `/api/execution-runs/:runId/approve` | workspace:write | Approve a run. |

## Workflows

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/workflows` | write on POST | List/create workflows. |
| GET/PUT | `/api/workflows/:id` | write on PUT | Fetch/update a workflow graph. |
| POST | `/api/workflows/:id/validate` | â€” | Validate a graph. |
| GET/POST | `/api/workflows/:id/runs` | experiment:run | Run and list workflow executions. |

## Prompts and playground

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/prompts` | write on POST | Prompt registry. |
| GET | `/api/prompts/:id` | â€” | Prompt detail. |
| POST | `/api/prompts/:id/versions` | workspace:write | Add a version. |
| POST | `/api/prompts/:id/render` | â€” | Render a version with variables. |
| POST | `/api/prompts/playground` | experiment:run | Streamed multi-model playground run. |
| GET | `/api/prompts/jobs` (+`/:id/stream`) | read | Playground job status and SSE stream. |

## Observability

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/traces` Â· `/api/traces/:traceId` | â€” | Trace explorer. |
| POST | `/api/traces/ingest` | â€” | Ingest a span. |
| POST | `/api/traces/:traceId/replay` | â€” | Causal replay of a trace. |
| GET | `/api/telemetry/events` Â· `/dashboard` Â· `/achievements` | telemetry:read | Telemetry queries. |
| GET | `/api/telemetry/stream` (+`/telemetry`) | telemetry:read | Live SSE event stream. |
| POST | `/api/telemetry/events` | workspace:write | Ingest a telemetry event. |
| GET | `/api/status` Â· `/api/health` Â· `/api/dashboard` | mixed | Runtime status endpoints. |
| GET | `/api/platform/causal-graph` Â· `/telemetry/summary` | â€” | Platform observability. |

## Experiments, evaluation and arena

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/experiments` (+`/launch`) | experiment:write | Experiment lifecycle. |
| GET | `/api/experiments/recent` Â· `/analysis` Â· `/thoughts` Â· `/coevolution` Â· `/:id/waves` | â€” | Experiment views. |
| GET | `/api/evals/datasets` (+`/:id/cases`, `/jobs`) | â€” | Dataset and job registry. |
| POST | `/api/evals/datasets` (+cases, `/jobs`) | write / experiment:run | Tenant-scoped evaluation writes. |
| GET | `/api/evaluation/overview` | â€” | MCTS and evaluation state. |
| POST | `/api/evaluation/impossible-bench` | workspace:write | Run ImpossibleBench. |
| POST | `/api/evaluation/mcts/:id/prune` | workspace:write | Prune an MCTS node. |
| POST | `/api/evaluation/notifications` | workspace:write | Notification preferences. |
| GET/POST | `/api/arena/tournament` Â· `/pareto` Â· `/trace` | â€” | Solver tournaments and Pareto views. |

## Swarm, lineage and memory

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/swarm/consensus` Â· `/metrics` Â· `/topology` | â€” | Swarm monitor. |
| POST | `/api/swarm/proposals` | swarm:propose | Create a proposal. |
| POST | `/api/swarm/vote` | swarm:vote | Cast a vote. |
| GET | `/api/lineage` Â· `/genome/graph` Â· `/phylogeny` Â· `/alleles` | â€” | Genome and lineage graphs. |
| POST | `/api/nodes/clone` Â· `/nodes/kill` | workspace:write | Node operations. |
| POST | `/api/genome/crossover` Â· `/synthesize` Â· `/decision` | workspace:write | Genetic operations. |
| GET/POST | `/api/memory/search` | â€” | Experience search. |
| POST | `/api/memory/cherry-pick` Â· `/counterfactual` | â€” | Memory transfer operations. |

## Resilience and incidents

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/resilience/policy` | security:manage | Resilience policy. |
| POST | `/api/resilience/apoptosis` | emergency_kill | Trigger apoptosis. |
| POST | `/api/resilience/cryptobiosis/freeze` Â· `/thaw` | emergency_kill | Freeze/thaw agents. |
| GET/POST | `/api/resilience/drift` | â€” | Drift analysis. |
| GET | `/api/alerts` Â· `/api/incidents` | â€” | Incident views (alerts paginated). |
| POST | `/api/incidents/replay` Â· `/api/platform/incidents/bisect` | write | Replay and bisection. |
| POST | `/api/tasks/:id/kill` | emergency_kill | Kill one task. |

## Model providers and platform control plane

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/config` Â· `/api/model` Â· `/api/model/local` | â€” | Configuration and model discovery. |
| POST | `/api/model/test` | experiment:run | Probe a model. |
| GET/POST | `/api/budget` | security:manage | Spend budget policy. |
| POST | `/api/profile` | workspace:write | Update display profile. |
| GET/POST | `/api/platform/providers` | security:manage | Register model providers. |
| POST | `/api/platform/route` | read | Route a request through the model router. |
| GET/PUT | `/api/platform/model-routing/policies(/:agentId)` | read / security:manage | Routing policies. |
| GET/POST | `/api/platform/permissions` Â· `/audit` Â· `/approvals` | security:manage | Governance surfaces. |
| POST | `/api/platform/approvals/:id/decision` | security:manage | Decide an approval. |
| POST | `/api/platform/tool-calls/validate` | mcp:execute_safe | Validate a tool call. |
| POST | `/api/platform/incidents/:incidentId/replay` | read | Step-by-step incident replay. |
| POST | `/api/platform/evaluations/pareto` | â€” | Pareto frontier computation. |

## MCP tools

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/tools` Â· `/tools/metrics` Â· `/tools/:name/schema` | â€” | Tool catalogue. |
| POST | `/api/tools/dry-run` Â· `/tools/test` | safe test | Simulate or execute safely. |
| POST | `/api/mcp/execute` Â· `/mcp/equip` | mcp:execute_safe / write | Execute/equip a tool. |
| POST | `/api/mcp/circuit-breaker` | override_breaker | Toggle the MCP breaker. |

## Rust bridge

Mounted under `/api/rust`; drives the real `genos` CLI.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/rust/status` Â· `/snapshots` | read | CLI availability and snapshot list. |
| POST | `/api/rust/snapshots` | workspace:write | Create a snapshot through the core. |
| POST | `/api/rust/diff` Â· `/replay` Â· `/hallucination/*` | read / experiment:run | Core-backed diff, replay, hallucination ops. |

## Product proofs

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/product-proofs/safe-debugging` | â€” | Latest proof evidence. |
| POST | `/api/product-proofs/safe-debugging/run` | experiment:run | Run the proof end to end. |
| GET/POST | `/api/product-proofs/safe-debugging/workspaces/:workspaceId(/run)` | experiment:run | Inspect and test proof workspaces. |

## Organization control plane

Mounted under `/api/control-plane`.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/organizations` | write on POST | Organizations. |
| GET/POST | `/projects` (+`/:id/members`) | org-admin rules | Projects and memberships. |
| GET | `/environments` Â· `/workers` | â€” | Environments and worker pool status. |

## Registries, releases and marketplace

Mounted under `/api/registry`, `/api/releases`.

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/registry` Â· `/:kind` Â· `/marketplace` | â€” | Artifact registry. |
| POST | `/api/registry/:kind` (+versions, publish, install) | workspace:write | Tenant-scoped registry writes. |
| GET/POST | `/api/releases` (+`/:id/promote`, `/rollback`) | workspace:write | Staging releases and promotion gates. |
| GET/POST | `/api/releases/rollouts` (+metrics, decide) Â· `/chargeback` | write on POST | Progressive rollouts. |

## Integrations, compliance and IDE

| Method | Path | Permission | Description |
|---|---|---|---|
| GET/POST | `/api/integrations` (+`/:id/test`, DELETE) | write | Connector registry. |
| GET | `/api/compliance/frameworks` Â· `/reports` | â€” | Compliance reports. |
| POST | `/api/compliance/reports` | workspace:write | Generate a report. |
| GET | `/api/compliance/reports/:id/export` | â€” | Export a report. |
| GET | `/api/ide/contract` Â· `/integrations` | â€” | IDE contract and connections. |
| POST | `/api/ide/integrations` Â· `/commands/:command` | â€” | IDE command dispatch. |

## Strategies, schemas, secrets, SSO and plugins

| Method | Path | Permission | Description |
|---|---|---|---|
| GET | `/api/strategies` | â€” | Strategy registry. |
| POST | `/api/strategies/select` | workspace:write | Preview strategy selection. |
| GET | `/api/schema/status` Â· POST `/schema/migrate` | write | Migration status. |
| GET/POST | `/api/secrets` | admin role | Encrypted secret vault. |
| GET/POST | `/api/sso/providers` (+start/callback/ACS) | admin on POST | OIDC/SAML providers. |
| GET/POST | `/api/plugins` (+`/:id/run`) | admin role | Sandboxed plugin execution. |

## Commands, trajectories, frameworks, webhooks

| Method | Path | Permission | Description |
|---|---|---|---|
| POST | `/api/command` Â· `/api/terminal` | admin/operator | Command dispatch and terminal. |
| GET | `/api/trajectories` (+`/pending`, `/active`) | â€” | Trajectory review queues. |
| POST | `/api/trajectories` (+approve/reject/revise) | workspace:write | Trajectory decisions. |
| GET/POST | `/api/frameworks/:framework/run` (+`/runs`) | write | Framework executions. |
| GET/POST | `/api/webhooks` | write | HTTPS webhook subscriptions. |


### RAG and Knowledge Base (Added in Lot 2)
| Method | Endpoint | Description |
|---|---|---|
| GET | /api/rag/documents | List all ingested knowledge documents |
| POST | /api/rag/documents | Ingest a new document |
| GET | /api/rag/documents/:id/chunks | Retrieve chunks for a specific document |
| POST | /api/rag/search | Perform vector search over knowledge base |
