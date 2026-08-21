# GenOS Wire Protocol Specification

The GenOS Protocol defines the provider-neutral, language-agnostic boundary between client applications (IDEs, autonomous orchestrators, CLI wrappers) and the GenOS runtime. It is built upon JSON-RPC 2.0 with extensions for isolated counterfactual states and trajectory provenance.

---

## 1. Protocol Architecture & Transports

GenOS supports two primary transports for JSON-RPC 2.0 communication:

```text
+------------------------+             +------------------------+
| Client (Codex/IDE/SDK) |             | GenOS MCP / Core Host  |
+------------------------+             +------------------------+
            |                                      |
            |--- [STDIO: \n delimited JSON-RPC] -->|
            |--- [HTTP POST: /mcp Endpoint] ------>|
            |<-- [JSON-RPC Response Envelope] -----|
```

### Transport 1: STDIO Framing
- Messages are transmitted as single-line JSON objects terminated strictly by `\n` (`0x0A`).
- No internal unescaped newlines within a single JSON payload.
- Clients and servers must use unbuffered or line-buffered I/O streams.

### Transport 2: Streamable HTTP Transport
- Endpoint: `POST /mcp`
- Headers: `Content-Type: application/json`
- Health Check: `GET /health` -> `{"status": "ok"}`
- Responses are delivered synchronously as JSON HTTP response bodies with status `200 OK` (or `202 Accepted` for asynchronous notifications).

---

## 2. Message Envelopes & Lifecycle Schemas

### 2.1 Standard Request Envelope
```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "method": "tools/call",
  "params": {
    "name": "genos_snapshot",
    "arguments": {
      "capsule_id": "caps_worker_01",
      "label": "pre-mutation-checkpoint"
    }
  }
}
```

### 2.2 Standard Success Response Envelope
```json
{
  "jsonrpc": "2.0",
  "id": "req-101",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"protocol_version\":\"genos.protocol/v1alpha1\",\"operation\":\"snapshot\",\"exit_code\":0,\"output\":{\"snapshot_id\":\"snap_01H8X\"},\"stdout\":\"\",\"stderr\":\"\"}"
      }
    ],
    "structuredContent": {
      "protocol_version": "genos.protocol/v1alpha1",
      "operation": "snapshot",
      "exit_code": 0,
      "output": {
        "snapshot_id": "snap_01H8X"
      },
      "stdout": "Snapshot snap_01H8X saved.",
      "stderr": ""
    },
    "isError": false
  }
}
```

### 2.3 Notification Envelope
Notifications omit the `id` field and do not expect a response:
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/stateChanged",
  "params": {
    "capsule_id": "caps_worker_01",
    "event": "branch_forked",
    "new_snapshot_id": "snap_01H8Y"
  }
}
```

---

## 3. Handshake & Initialization

### Request: `initialize`
Sent by the client upon establishing connection to negotiate protocol capabilities and versions.

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "roots": {"listChanged": true},
      "sampling": {}
    },
    "clientInfo": {
      "name": "codex-client",
      "version": "1.4.0"
    }
  }
}
```

### Response: `initialize`
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {"listChanged": false}
    },
    "serverInfo": {
      "name": "genos-mcp",
      "version": "0.1.0"
    },
    "instructions": "GenOS manages isolated capsules, counterfactual branches, and living ADRs."
  }
}
```

Supported protocol versions in order of preference: `2025-06-18`, `2025-03-26`, `2024-11-05`.

---

## 4. Tool Discovery & Dynamic Invocations

### `tools/list`
Discovers all registered GenOS primitives with JSON Schemas and annotations:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response**:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "genos_snapshot",
        "description": "Checkpoint an atomic agent-world capsule.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "capsule_id": {"type": "string", "description": "Target capsule identifier"},
            "label": {"type": "string", "description": "Optional human-readable label"}
          },
          "required": ["capsule_id"]
        },
        "annotations": {
          "readOnly": false,
          "destructive": false,
          "openWorld": false
        }
      }
    ]
  }
}
```

---

## 5. Standard and Domain Error Codes

GenOS partitions error handling into two clear domains: Protocol Faults (RPC transport / syntax) and Domain Faults (application state & safety invariants).

### 5.1 JSON-RPC 2.0 Standard Error Codes

| Code | Constant | Meaning | Description |
|---|---|---|---|
| `-32700` | `PARSE_ERROR` | Parse Error | Invalid JSON received by the server. |
| `-32600` | `INVALID_REQUEST` | Invalid Request | The JSON payload is not a valid Request object. |
| `-32601` | `METHOD_NOT_FOUND` | Method Not Found | The requested RPC method does not exist. |
| `-32602` | `INVALID_PARAMS` | Invalid Params | Method parameter validation failed (missing/invalid arguments). |
| `-32603` | `INTERNAL_ERROR` | Internal Error | Internal runtime crash or unhandled server fault. |

### 5.2 GenOS Custom Domain Error Codes (`-32001` to `-32010`)

When a domain contract or safety boundary is violated, GenOS returns custom RPC error codes:

| Code | Constant | Description | Remediation |
|---|---|---|---|
| `-32001` | `CAPSULE_NOT_FOUND` | Specified capsule identifier does not exist. | Verify capsule ID via `genos_inspect` or list active capsules. |
| `-32002` | `SNAPSHOT_CORRUPTED` | CAS hash mismatch or corrupted snapshot manifest. | Restore from previous valid snapshot or re-initialize. |
| `-32003` | `BUDGET_EXHAUSTED` | Agent exceeded maximum compute/step/token budget. | Increase budget allocation or terminate branch. |
| `-32004` | `CIRCUIT_BREAKER_OPEN` | Execution halted by open circuit breaker (cooldown active). | Wait for cooldown or call `genos_resilience_circuit_breaker`. |
| `-32005` | `HYPOTHESIS_FALSIFIED` | Operation requires a valid hypothesis, but all were falsified. | Formulate new hypotheses with `genos_diagnose`. |
| `-32006` | `WORLD_ISOLATION_FAULT` | Sandbox leak or worktree allocation failure. | Clean stale Git worktrees via `genos world destroy`. |
| `-32007` | `TAINT_POLICY_VIOLATION` | Untrusted/tainted artifact blocked by Policy Plane. | Validate artifact against repository genome invariants. |
| `-32008` | `MERGE_CONFLICT_UNRESOLVABLE` | Cognitive merge engine cannot reconcile conflicting branches. | Conduct manual trajectory arbitration or cherry-pick experience. |
| `-32009` | `STASIS_INTEGRITY_FAILURE` | Cryptobiosis snapshot decompression/integrity error. | Re-verify cold storage archive checksum. |
| `-32010` | `SWARM_QUORUM_UNMET` | Distributed swarm consensus voting failed to reach threshold. | Re-run consensus with adjusted quorum parameters. |

### Domain Error Response Example
```json
{
  "jsonrpc": "2.0",
  "id": "req-103",
  "error": {
    "code": -32004,
    "message": "Circuit breaker is OPEN: tool execution blocked due to repeated failures",
    "data": {
      "cooldown_remaining_ms": 3200,
      "failure_count": 3,
      "threshold": 3
    }
  }
}
```

---

## 6. Protocol Errors vs Execution Failures

A critical architectural principle in GenOS is the strict distinction between **Protocol Errors** and **Execution Failures**:

```text
                                [Tool Call Request]
                                         |
                                         v
                         +-------------------------------+
                         | Valid JSON-RPC & Arguments?   |
                         +-------------------------------+
                                    /         \
                             [No]  /           \  [Yes]
                                  v             v
             +------------------------+   +-------------------------------+
             | JSON-RPC Error         |   | Execute in Isolated Sandbox   |
             | (code: -32602 / -32001)|   +-------------------------------+
             +------------------------+             /           \
                                                   /             \
                                        [Success] /               \ [Failure: exit != 0]
                                                 v                 v
                                  +---------------------+   +---------------------+
                                  | JSON-RPC Success    |   | JSON-RPC Success    |
                                  | isError: false      |   | isError: true       |
                                  | exit_code: 0        |   | exit_code: 1        |
                                  | stdout: <output>    |   | stderr: <compiler>  |
                                  +---------------------+   +---------------------+
```

1. **Protocol Error (`error` object populated)**: Occurs when arguments are invalid, JSON is malformed, or security policy blocks execution.
2. **Execution Failure (`result` object populated with `isError: true`)**: Occurs when a command executes inside an isolated capsule but fails (e.g. test fails, compiler error). The LLM agent receives standard output and error logs in `structuredContent`, enabling automated counterfactual reasoning and repair.
