# OpenAI Codex & IDE MCP Integration Guide

This guide details how to integrate GenOS with OpenAI Codex, Claude Code, Cline, Roo Code, JetBrains, and Cursor using the Model Context Protocol (MCP) over STDIO or Streamable HTTP.

---

## 1. Architectural Overview

IDE assistants and autonomous agents connect to `genos-mcp` as a structured tool provider. GenOS isolates workspace mutations in ephemeral Git worktrees, records cognitive decision trees, and enforces repository genome invariants.

```text
+-------------------------------------------------------------+
| IDE / Agent Client (Codex, Claude Desktop, Cline, JetBrains)|
+-------------------------------------------------------------+
                              |
                     [JSON-RPC 2.0 / MCP]
                              |
                              v
+-------------------------------------------------------------+
| genos-mcp Daemon / Adapter (Policy Plane & Circuit Breaker) |
+-------------------------------------------------------------+
                              |
               [Direct Process Invocation / argv]
                              |
                              v
+-------------------------------------------------------------+
| GenOS Core Engine (Capsules, Worktrees, CAS Store, DAG)     |
+-------------------------------------------------------------+
```

---

## 2. Client Configuration Profiles

### 2.1 Cline & Roo Code (`cline_mcp_settings.json`)
Add the `genos` server configuration to your global or project `cline_mcp_settings.json`:

```json
{
  "mcpServers": {
    "genos": {
      "command": "genos",
      "args": ["mcp", "stdio"],
      "env": {
        "GENOS_ROOT": "${workspaceFolder}/.genos",
        "GENOS_WORKSPACE_ROOT": "${workspaceFolder}"
      },
      "disabled": false,
      "autoApprove": [
        "genos_inspect",
        "genos_diff",
        "genos_lineage",
        "genos_replay",
        "genos_blame",
        "genos_search_failures"
      ]
    }
  }
}
```

### 2.2 VS Code & OpenAI Codex (`.vscode/settings.json` / `.codex/config.toml`)

#### `.vscode/settings.json`:
```json
{
  "mcp.servers": {
    "genos": {
      "command": "genos",
      "args": ["mcp", "stdio"],
      "options": {
        "cwd": "${workspaceFolder}",
        "env": {
          "GENOS_ROOT": "${workspaceFolder}/.genos",
          "GENOS_WORKSPACE_ROOT": "${workspaceFolder}"
        }
      }
    }
  }
}
```

#### `.codex/config.toml`:
```toml
[mcp_servers.genos]
command = "genos"
args = ["mcp", "stdio"]
cwd = "${workspaceFolder}"
default_tools_approval_mode = "writes"

[mcp_servers.genos.env]
GENOS_ROOT = "${workspaceFolder}/.genos"
GENOS_WORKSPACE_ROOT = "${workspaceFolder}"

# Require explicit prompt approval for world command executions
[mcp_servers.genos.tools.genos_run]
approval_mode = "prompt"

[mcp_servers.genos.tools.genos_workspace_experiment]
approval_mode = "prompt"
```

### 2.3 JetBrains IDEs (Fleet / IntelliJ / RustRover)
Configure under **Settings | Tools | Model Context Protocol**:

```json
{
  "name": "genos",
  "transport": "stdio",
  "executable": "/usr/local/bin/genos",
  "arguments": ["mcp", "stdio"],
  "workingDirectory": "$PROJECT_DIR$",
  "environment": {
    "GENOS_ROOT": "$PROJECT_DIR$/.genos",
    "GENOS_WORKSPACE_ROOT": "$PROJECT_DIR$"
  }
}
```

### 2.4 Claude Desktop (`claude_desktop_config.json`)
Path: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "genos": {
      "command": "genos",
      "args": ["mcp", "stdio"],
      "env": {
        "GENOS_ROOT": "/absolute/path/to/project/.genos",
        "GENOS_WORKSPACE_ROOT": "/absolute/path/to/project"
      }
    }
  }
}
```

---

## 3. Tool Classification & Approval Policies

GenOS categorizes its 40 MCP tools into distinct security tiers via tool annotations:

| Security Tier | Default Approval | Tools |
|---|---|---|
| **Analytical / Read-Only** | `auto-approve` | `genos_inspect`, `genos_diff`, `genos_lineage`, `genos_replay`, `genos_blame`, `genos_search_failures`, `genos_bisect_agent`, `genos_analyze_trajectory` |
| **Cognitive Mutations** | `writes` | `genos_create`, `genos_snapshot`, `genos_restore`, `genos_fork`, `genos_diagnose`, `genos_hypothesis_evidence`, `genos_record_decision`, `genos_compile_memory`, `genos_invalidate_assumption` |
| **Isolated Execution** | `prompt` | `genos_run`, `genos_workspace_experiment`, `genos_bug_investigation`, `genos_security_coevolution` |

---

## 4. Operational Lifecycle & Hook Triggers

Integrate GenOS counterfactual workflows into agent development loops:

```text
  1. Diagnose & Hypothesize       -->   genos_diagnose(...)
  2. Checkpoint Active State      -->   genos_snapshot(...)
  3. Fork Candidate Trajectories  -->   genos_fork(...)
  4. Test in Isolated Worktrees   -->   genos_run(...)
  5. Diff & Evaluate Evidence     -->   genos_diff(...) + genos_evaluate_trajectories(...)
  6. Commit Living ADR & Merge    -->   genos_record_decision(...) + genos_merge(...)
```

### Hook Trigger 1: Pre-Mutation Hypothesis Validation
Before generating code fixes, the agent queries past failures and creates a falsification tree:
```text
Agent calls: genos_search_failures(query="Redis lock timeout")
Agent calls: genos_diagnose(problem="Redis lock timeout", hypotheses=["Pool starvation", "Clock skew"])
```

### Hook Trigger 2: Speculative Counterfactual Branching
Before editing files, snapshot the parent world and fork branch capsules:
```text
Agent calls: genos_snapshot(capsule_id="main_active", label="pre-fix")
Agent calls: genos_fork(capsule_id="main_active", branches=[{"label": "b1", "hypothesis": "Increase pool cap"}])
```

### Hook Trigger 3: Sandboxed World Execution
Execute test commands inside the branch world without modifying the host repository:
```text
Agent calls: genos_run(capsule_id="caps_b1", command="cargo test -p redis-client")
```

### Hook Trigger 4: Post-Verification Living ADR
Once tests pass, record the Architecture Decision Record with linked evidence:
```text
Agent calls: genos_record_decision(title="Increase Redis pool ceiling to 50", evidence=["tests/redis_test.log"])
Agent calls: genos_merge(manifest="experiments/merge_b1.yaml")
```

---

## 5. Security Sandboxing & Guardrails

1. **Zero Unsanitized Shell Execution**: `genos-mcp` never passes user input to `sh -c` or `cmd.exe`. Commands are executed directly via Rust `std::process::Command` using explicit `argv` vectors.
2. **Worktree Sandboxing**: All file modifications and command runs inside `genos_run` occur in dedicated, isolated Git worktrees (`.genos/worktrees/<id>`).
3. **Budget & Timeout Enforcement**: Commands are hard-capped by CPU execution time and step count limits configured in the agent genome.
4. **Policy Plane & Taint Tracking**: Outputs from unverified tool executions are marked `is_tainted: true`. Untrusted code cannot be merged without satisfying genome invariants.
5. **Circuit Breakers**: Repeated execution errors automatically trip the Half-Open circuit breaker, protecting downstream systems from infinite repair loops.

---

## 6. Troubleshooting & Diagnostics

- **MCP Connection Refused**: Verify that `genos` is present in your system `PATH` or specify the absolute binary path in the configuration.
- **Worktree Lock Contention**: If a prior agent crashed mid-execution, run `genos world destroy <WORLD_ID>` to prune orphaned worktrees.
- **Timeout on Tool Execution**: Increase the client MCP timeout setting (e.g. `"timeout": 120` in IDE settings) for large compilation tasks.
