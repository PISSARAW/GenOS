# Tool permission demo

With the genome permission `http/network = denied`, the checked tool path
records the request and refuses execution:

```text
tool.requested → tool.failed(permission_denied)
```

Run the deterministic test:

```powershell
cargo test -p genos-core denied_network_tool_is_audited_without_execution
```
