param(
  [string]$FpAmbRoot = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) 'FP-AMB'),
  [string]$Model = 'qwen2.5-coder:7b',
  [string]$EmbeddingProvider = 'ollama',
  [string]$EmbeddingModel = 'qwen3-embedding:4b',
  [int]$EmbeddingTimeoutMs = 30000,
  [int]$AnswerMaxTokens = 192,
  [int]$MemoryTopK = 15,
  [string]$EmbeddingUrl = '',
  [string]$OutputRoot = (Join-Path (Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))) 'GenOSWork\fpamb-runs')
)

$ErrorActionPreference = 'Stop'
if ($MemoryTopK -lt 1 -or $MemoryTopK -gt 20) { throw 'MemoryTopK must be between 1 and 20.' }
if ($AnswerMaxTokens -lt 90) { throw 'AnswerMaxTokens must be at least 90.' }
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$FpAmbRoot = (Resolve-Path $FpAmbRoot).Path
$python = Join-Path $FpAmbRoot 'venv_win\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "FP-AMB Python environment not found: $python" }

$null = & ollama show $Model 2>$null
if ($LASTEXITCODE -ne 0) { throw "Ollama model is unavailable: $Model" }
if ($EmbeddingProvider -eq 'ollama') {
  $null = & ollama show $EmbeddingModel 2>$null
  if ($LASTEXITCODE -ne 0) { throw "Ollama embedding model is unavailable: $EmbeddingModel" }
}
$runDir = Join-Path $OutputRoot ('fpamb-real-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()

$env:GENOS_FPAMB_RUN_DIR = $runDir
$env:GENOS_FPAMB_DB_PATH = Join-Path $runDir 'genos-fpamb.sqlite'
$env:GENOS_FPAMB_BRIDGE_PORT = [string]$port
$env:GENOS_FPAMB_TRACE_PATH = Join-Path $runDir 'model-route-traces.jsonl'
$env:GENOS_FPAMB_MEMORY_TRACE_PATH = Join-Path $runDir 'memory-retrieval-traces.jsonl'
$env:GENOS_FPAMB_MODEL = $Model
$env:GENOS_FPAMB_MAX_TOKENS = [string]$AnswerMaxTokens
$env:GENOS_FPAMB_TOP_K = [string]$MemoryTopK
$env:GENOS_MEMORY_REQUIRE_SEMANTIC = 'true'
$env:GENOS_EMBEDDING_TIMEOUT_MS = [string]$EmbeddingTimeoutMs
$env:GENOS_EMBEDDING_PROVIDER = $EmbeddingProvider
$env:GENOS_EMBEDDING_MODEL = $EmbeddingModel
if ($EmbeddingUrl) { $env:GENOS_EMBEDDING_URL = $EmbeddingUrl }
$provider = Join-Path $repoRoot 'integrations\fpamb\genos_runtime_provider.py'
$endpoint = "http://127.0.0.1:$port/api/generate"
$scorecardPath = Join-Path $runDir 'scorecard.json'

Push-Location $FpAmbRoot
try {
  & $python -m fp_amb evaluate --provider $provider --llm --model $Model `
    --ollama-url $endpoint --output $scorecardPath
  if ($LASTEXITCODE -ne 0) { throw "FP-AMB evaluator exited with code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$scorecard = Get-Content -Raw -LiteralPath $scorecardPath | ConvertFrom-Json
$trace = @(Get-Content -LiteralPath $env:GENOS_FPAMB_TRACE_PATH | ForEach-Object { $_ | ConvertFrom-Json })
$memoryTracePath = $env:GENOS_FPAMB_MEMORY_TRACE_PATH
$memoryTrace = @(Get-Content -LiteralPath $memoryTracePath | ForEach-Object { $_ | ConvertFrom-Json })
$memoryStatsPath = Join-Path $runDir 'genos-memory-runtime-stats.json'
if (-not (Test-Path -LiteralPath $memoryStatsPath)) { throw 'GenOS memory runtime statistics were not persisted.' }
$memoryStatsDocument = Get-Content -Raw -LiteralPath $memoryStatsPath | ConvertFrom-Json
$memoryStats = if ($memoryStatsDocument.stats) { $memoryStatsDocument.stats } else { $memoryStatsDocument }
$routeErrors = @($trace | Where-Object { $_.error }).Count
$maxContextMemories = $MemoryTopK + 5
$unboundedContexts = @($memoryTrace | Where-Object { $_.returnedMemories -gt $maxContextMemories -or $_.returnedMemories -gt $_.scoredCandidates }).Count
$wrongTokenBudgets = @($trace | Where-Object { $_.maxTokens -ne $AnswerMaxTokens }).Count
if ($scorecard.total_evaluated_questions -ne 262 -or $trace.Count -ne 262 -or $routeErrors -ne 0 -or
    $unboundedContexts -ne 0 -or $wrongTokenBudgets -ne 0) {
  throw "Incomplete or failed run: questions=$($scorecard.total_evaluated_questions), routes=$($trace.Count), errors=$routeErrors"
}
if ($memoryStats.turnsIngested -ne $memoryStats.semanticEmbeddingTurns -or
    $memoryStats.semanticRetrievals -ne $scorecard.total_evaluated_questions -or
    $memoryStats.graphRagLookups -ne $scorecard.total_evaluated_questions -or
    $memoryStats.modelCalls -ne $trace.Count -or
    $memoryStats.graphLinksCreated -le 0 -or
    $memoryStats.graphVerificationChecks -ne $memoryStats.graphLinksCreated -or
    $memoryStats.graphVerificationFailures -ne 0 -or
    $memoryStats.contextMemoriesReturned -gt ($scorecard.total_evaluated_questions * $maxContextMemories) -or
    $memoryTrace.Count -ne $scorecard.total_evaluated_questions) {
  throw "GenOS memory stack verification failed: turns=$($memoryStats.turnsIngested), semanticEmbeddings=$($memoryStats.semanticEmbeddingTurns), semanticRetrievals=$($memoryStats.semanticRetrievals), graphLinks=$($memoryStats.graphLinksCreated), graphChecks=$($memoryStats.graphVerificationChecks), graphFailures=$($memoryStats.graphVerificationFailures), memoryTraces=$($memoryTrace.Count)"
}

$fpAmbCommit = (& git -C $FpAmbRoot rev-parse HEAD).Trim()
$genosCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
$genosStatus = @(& git -C $repoRoot status --short)
$inputs = @(
  (Join-Path $FpAmbRoot 'data\fp_amb_500k_cross_session.jsonl'),
  (Join-Path $FpAmbRoot 'data\master_ground_truth_answer_key.json'),
  $provider,
  (Join-Path $repoRoot 'integrations\fpamb\run-real-benchmark.ps1'),
  (Join-Path $repoRoot 'integrations\fpamb\genos-runtime-bridge.cjs'),
  (Join-Path $repoRoot 'backend\src\services\embeddingProvider.js'),
  (Join-Path $repoRoot 'backend\src\services\graphRagService.js'),
  (Join-Path $repoRoot 'backend\src\services\memoryScoring.js'),
  (Join-Path $repoRoot 'backend\src\services\promotionMemoryReadGate.js'),
  (Join-Path $repoRoot 'backend\src\services\primitiveHandlers\memoryStdp.js'),
  (Join-Path $repoRoot 'backend\src\services\vectorMemoryService.js'),
  $scorecardPath,
  $env:GENOS_FPAMB_TRACE_PATH,
  $memoryTracePath,
  $memoryStatsPath
)
$hashes = @{}
foreach ($file in $inputs) { $hashes[[IO.Path]::GetFileName($file)] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() }
$manifest = [ordered]@{
  benchmark = 'FP-AMB'
  status = 'completed'
  timestamp = $scorecard.timestamp
  provider = 'GenOS VectorMemoryService + semantic embeddings + GraphRAG/STDP + GenOS modelRouter'
  answerModel = $Model
  answerMaxTokens = $AnswerMaxTokens
  memoryTopK = $MemoryTopK
  embeddingProvider = $EmbeddingProvider
  embeddingModel = $EmbeddingModel
  embeddingTimeoutMs = $EmbeddingTimeoutMs
  evaluatorMode = 'Full LLM Generation'
  questions = $scorecard.total_evaluated_questions
  passedItems = $scorecard.passed_items
  accuracyPercent = $scorecard.overall_accuracy_pct
  modelRouteCalls = $trace.Count
  modelRouteErrors = $routeErrors
  memoryRuntime = $memoryStats
  fpAmbCommit = $fpAmbCommit
  genosCommit = $genosCommit
  genosWorktreeDirty = ($genosStatus.Count -gt 0)
  genosWorktreeStatus = $genosStatus
  sha256 = $hashes
  scorecard = $scorecardPath
  modelRouteTrace = $env:GENOS_FPAMB_TRACE_PATH
  memoryRetrievalTrace = $memoryTracePath
  memoryRuntimeStats = $memoryStatsPath
  database = $env:GENOS_FPAMB_DB_PATH
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runDir 'manifest.json') -Encoding utf8
Write-Output "RESULTS=$runDir"
