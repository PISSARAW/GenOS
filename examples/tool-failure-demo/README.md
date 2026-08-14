# Tool failure demo

The missing-file scenario is covered by the executable core test:

```powershell
cargo test -p genos-core failed_tool_call_is_recorded_without_failing_the_runtime
```

Expected event chain:

```text
tool.requested → tool.failed
```

The failed tool result remains in the branch history; the runtime itself does
not fail and can continue with the next step.
