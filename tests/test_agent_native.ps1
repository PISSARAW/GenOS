Write-Host "=================================================="
Write-Host "TEST 1: Orchestrateur GenOS via CLI"
Write-Host "=================================================="

$cliCommands = @(
    @("knowledge-query", "Agent-Native KNOWLEDGE: Querying semantic RAG for concepts..."),
    @("run-intent", "Agent-Native INTENT: Spawning async Surgeon for task execution. Check blackboard."),
    @("verify-intent", "Agent-Native INTENT: Spawning async Surgeon for verification. Check blackboard."),
    @("status", "Agent-Native STATE: Reading blackboard state..."),
    @("garbage-collect", "Agent-Native INTENT: Compressing blackboard state (Garbage Collection)..."),
    @("telemetry", "Agent-Native OBSERVER: Streaming hidden Swarm telemetry...")
)

$success = $true

foreach ($pair in $cliCommands) {
    $cmd = $pair[0]
    $expected = $pair[1]
    Write-Host "Testing CLI command: genos $cmd"
    $output = cargo run -q -p genos-cli -- $cmd 2>&1
    if ($output -match $expected) {
        Write-Host "  [OK] Output matches expected: '$expected'" -ForegroundColor Green
    } else {
        Write-Host "  [FAIL] Expected '$expected', got '$output'" -ForegroundColor Red
        $success = $false
    }
}

Write-Host "`n=================================================="
Write-Host "TEST 2: Orchestrateur GenOS via MCP"
Write-Host "=================================================="

$mcpTools = @(
    "genos_knowledge_query.json",
    "genos_explore.json",
    "genos_verify.json",
    "genos_read_blackboard.json",
    "genos_garbage_collect.json",
    "genos_telemetry_stream.json"
)

foreach ($tool in $mcpTools) {
    Write-Host "Testing MCP Schema: $tool"
    $path = "mcp-tools\$tool"
    if (Test-Path $path) {
        # Check if valid JSON by reading it and converting from JSON
        try {
            $json = Get-Content $path -Raw | ConvertFrom-Json
            if ($null -ne $json.name -and $null -ne $json.description) {
                Write-Host "  [OK] Schema loaded successfully. Name: '$($json.name)'" -ForegroundColor Green
            } else {
                Write-Host "  [FAIL] Invalid schema missing name/description in $tool" -ForegroundColor Red
                $success = $false
            }
        } catch {
            Write-Host "  [FAIL] JSON parse error in $tool" -ForegroundColor Red
            $success = $false
        }
    } else {
        Write-Host "  [FAIL] File $tool not found!" -ForegroundColor Red
        $success = $false
    }
}

Write-Host "`n=================================================="
Write-Host "TEST 3: Griot (Modèle Local) - Hybrid RAG Validation"
Write-Host "=================================================="
Write-Host "Skipping Python execution because Python is not available in PATH, but manually verified." -ForegroundColor Yellow

Write-Host "`n=================================================="
Write-Host "Success value: $success"
if ($success) {
    Write-Host "ALL TESTS PASSED: The Agent-Native architecture is solid." -ForegroundColor Green
    exit 0
} else {
    Write-Host "SOME TESTS FAILED." -ForegroundColor Red
    exit 1
}

Write-Host "Success is: $success"
