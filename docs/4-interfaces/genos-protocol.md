# GenOS protocol v1alpha1

The GenOS protocol is the provider-neutral boundary between lifecycle clients
and the runtime. Its serialized result version is `genos.protocol/v1alpha1`.
The canonical result schema is
[`spec/genos-protocol-v1alpha1.schema.json`](../spec/genos-protocol-v1alpha1.schema.json).

## Operations

| Operation | MCP tool | Effect |
| --- | --- | --- |
| `create` | `genos_create` | Create an agent genome |
| `snapshot` | `genos_snapshot` | Checkpoint an atomic capsule |
| `restore` | `genos_restore` | Restore a paused capsule |
| `fork` | `genos_fork` | Create isolated descendants |
| `run` | `genos_run` | Execute in an isolated world and consume budget |
| `inspect` | `genos_inspect` | Read and validate an agent genome |
| `diff` | `genos_diff` | Compare logical snapshots |
| `lineage` | `genos_lineage` | Read the lineage DAG |
| `replay` | `genos_replay` | Reconstruct event-sourced state |
| `merge` | `genos_merge` | Run evidence-aware cognitive merge |

Input schemas are generated from the same Rust catalogue used by the MCP
`tools/list` response. Every adapter therefore receives the same names,
descriptions, validation constraints, and read/write annotations.

## Result envelope

Every successful adapter execution returns this shape:

```json
{
  "protocol_version": "genos.protocol/v1alpha1",
  "operation": "diff",
  "exit_code": 0,
  "output": {},
  "stdout": "{}\n",
  "stderr": ""
}
```

`output` contains parsed CLI JSON when the canonical primitive emits a single
JSON value. `stdout` and `stderr` always preserve the original process output.
A non-zero `exit_code` is a tool execution error, not a transport or JSON-RPC
failure.

## Execution boundary

The MCP adapter starts the `genos` executable directly and passes every
argument separately; it does not construct a shell command. `genos_run` is the
intentional exception at the domain boundary: its `command` value is executed
inside the selected isolated world by the existing budgeted GenOS runtime.

The adapter uses `GENOS_BIN` when set, then looks for a sibling `genos` binary,
and finally falls back to `cargo run -p genos-cli`. `GENOS_WORKSPACE_ROOT`
selects the repository and process working directory.

