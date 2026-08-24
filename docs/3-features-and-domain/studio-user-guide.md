# Studio User Guide

This guide explains what every view of GenOS Studio does and which actions
are available. Architecture notes live in the
[Studio architecture page](../2-architecture/studio-architecture.md); this
page stays at the "what do I click" level. Breakthrough modules have their own
[deep-dive guide](studio-breakthrough-modules.md).

## Signing in

On first load Studio presents a sign-in card with two modes:

- **Connexion** — username and password (`admin` / `genos-admin` on a fresh
  database, or `GENOS_ADMIN_USERNAME` / `GENOS_ADMIN_PASSWORD`).
- **Jeton d'accès** — an administrator access key such as the bootstrap token
  printed by the backend on first start.

You can also choose *Continuer en lecture seule* to browse without an
account; elevated actions will reopen the sign-in gate. Sessions persist
across reloads.

The topbar shows the number of active agents and the red **HALT ALL** button:
it engages the backend MCP kill switch so no new tool invocation can start
(existing external runtimes keep running). The sidebar starts with a project
selector; the chosen workspace drives deployment, debugging and timeline views.

## Product proof

### Safe Parallel Debugging
Inspect a real workspace, run its verifier, pick a failing diagnostic and
launch **Create isolated repair mission** — an agent works on an isolated
branch while your main workspace stays untouched. Use **Refresh**,
the verifier selector and **Run verification** to re-check after a fix.

### Rust Core Console
Direct console to the Rust `genos` CLI, independent from the Studio database:
create a genome + snapshot, then per snapshot run hallucination
**Detect / Analyze**, **Simulate**, **Replay** or stage and **Run diff**
between two snapshots.

## Fleet operations

### Agents
Fleet table with bulk stop/delete, per-agent ping, consensus status and live
activity. Selecting an agent opens its profile.

### Agent Profile
Everything about one agent: state and files, strategy contract (with run
approval), tasks, trajectories, swarm links, memory/genome, experiments and
health diagnostics. Header actions: **Subscribe** to events and
**Clone Agent**.

### Agent Deployment
Deploy a subagent against the selected workspace: mission prompt (with quick
presets *Debug error*, *Explain codebase*, *Create architecture plan*),
agent type (GenOS, Antigravity, Codex, ChatGPT, Claude…), model tier and
workspace isolation (*Inherit* keeps the current workspace, *Branch* forks
one). After deploy, a telemetry terminal streams the agent's events; use
**Increase limits** to double the execution budget.

### Agent Trinity
Deploy three isolated agents with distinct strategies on the same mission and
watch the three worlds race (**Deploy 3 real agents**, monitoring refreshes
every 2 s).

### Fleets
Read-only overview: active vs total agents, workspace allocation and security
posture KPIs.

### Pending Trajectories
Human review queue for merges proposed by agents. Each trajectory shows a
semantic summary, adversarial QA feedback and a colored diff. Decide with
**Approve & Merge**, **Request Revision** or **Reject & Punish**.

### Global Alerts & Overrides
Issue-style alert list with filters (*Requires Human Override*, *Delegated to
Fleet*, *Agent Questions (@human)*, live swarm activity). Resolve items with
**Resolve Alert** or hand them to a new agent via **Delegate Goal**.

### Workspaces List
Discover workspaces mounted under the configured root, filter them
(*Has agents*, *Has snapshots*…), create one with **Initialize New
Workspace**, and select one as the active project.

### Experiments Lab
Scientific experiment workbench: initialize a protocol, watch waves and the
thought feed during execution, compare Red Team vs Blue Team coevolution, read
the analysis, and promote insights with **Promote to Global Genome DNA**.
*Active Experiments* shows the running cards with observed success rates.

## Runtime observers

### Live Neural Matrix
Animated canvas of the swarm topology. Read-only.

### Platform & Safety Center
Governance surfaces: causal graph of agents, aggregated telemetry
(events/tokens/cost), model routing policies (fallbacks, parallel review,
prefer-local), local model detection, step-by-step incident replay, human
approval queue and Zero Trust audit log.

### God Mode Terminal
Authenticated operations terminal backed by `POST /api/terminal`
(admin/operator only). Supported commands:

| Command | Effect |
|---|---|
| `help` | List available commands |
| `status` | System state, MCP tool count, running agents, breaker state |
| `halt` / `abort` | Engage the kill switch: block new MCP tool invocations |
| `resume` | Reset the kill switch |
| `agents` | List persisted agents and their status |
| `ping` | Backend uptime probe |
| `clear` | Clear the terminal buffer |

Anything else returns `UNSUPPORTED_COMMAND`. Note that `halt` blocks future
tool calls only; it never terminates external runtimes.

## Compliance

### Compliance & IDEs
Generate compliance reports for EU AI Act, SOC 2 or HIPAA and export them as
markdown, connect IDE adapters (VS Code, JetBrains, Antigravity) and apply
pending schema migrations.
