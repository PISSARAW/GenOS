# Tool execution demo

The `read_file` scenario is covered by the executable core test:

```powershell
cargo test -p genos-core read_file_result_is_attached_as_a_provenance_artifact
```

It verifies the complete chain:

```text
tool.requested → tool.completed → ToolOutputRecord → ArtifactRef (SHA-256)
```
