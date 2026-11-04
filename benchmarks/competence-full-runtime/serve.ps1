param(
  [Parameter(Mandatory=$true)][string]$OllamaExecutable,
  [Parameter(Mandatory=$true)][string]$ModelsDirectory,
  [Parameter(Mandatory=$true)][string]$AuditDirectory
)
$ErrorActionPreference='Stop'
$protocol=Get-Content -LiteralPath (Join-Path $PSScriptRoot 'protocol.json') -Raw | ConvertFrom-Json
foreach ($candidate in @($OllamaExecutable,$ModelsDirectory,$AuditDirectory)) {
  if ([IO.Path]::GetFullPath($candidate) -notmatch '^D:[\\/]') { throw 'LLM runtime must stay on D' }
}
$endpoint=[Uri]$protocol.endpoint
if ($endpoint.Host -ne '127.0.0.1') { throw 'Only the dedicated loopback endpoint is supported' }
if (Get-NetTCPConnection -LocalPort $endpoint.Port -State Listen -ErrorAction SilentlyContinue) {
  throw 'Endpoint already occupied; do not replace another running service'
}
if (Test-Path -LiteralPath $AuditDirectory) { throw 'Use a fresh server audit directory' }
New-Item -ItemType Directory -Path $AuditDirectory | Out-Null
$serverExecutable=Join-Path $AuditDirectory 'genos-competence-llm.exe'
Copy-Item -LiteralPath $OllamaExecutable -Destination $serverExecutable
$sourceHash=(Get-FileHash -LiteralPath $OllamaExecutable -Algorithm SHA256).Hash.ToLowerInvariant()
if ((Get-FileHash -LiteralPath $serverExecutable -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceHash) {
  throw 'Server executable copy changed'
}
New-Item -ItemType Junction -Path (Join-Path $AuditDirectory 'lib') -Target (Join-Path (Split-Path $OllamaExecutable) 'lib') | Out-Null
$temporaryDirectory=Join-Path $AuditDirectory 'tmp'
New-Item -ItemType Directory -Path $temporaryDirectory | Out-Null
$env:OLLAMA_MODELS=$ModelsDirectory
$env:OLLAMA_HOST=$endpoint.Authority
$env:OLLAMA_NUM_PARALLEL=[string]$protocol.serverParallelism
$env:OLLAMA_MAX_LOADED_MODELS='1'
$env:OLLAMA_VULKAN='false'
$env:OLLAMA_NO_CLOUD='true'
$env:TEMP=$temporaryDirectory
$env:TMP=$temporaryDirectory
$server=Start-Process -FilePath $serverExecutable -ArgumentList 'serve' -WorkingDirectory $AuditDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $AuditDirectory 'stdout.log') -RedirectStandardError (Join-Path $AuditDirectory 'stderr.log')
$receipt=@{schema='genos.llm-server-start/v1';pid=$server.Id;executable=$serverExecutable;executableHash=$sourceHash;
  endpoint=$protocol.endpoint;parallelism=$protocol.serverParallelism;contextTokens=$protocol.contextTokens;
  modelsDirectory=$ModelsDirectory;createdAt=[DateTime]::UtcNow.ToString('o')}
$receipt | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $AuditDirectory 'server-start.json') -Encoding utf8
$ready=$false
for ($index=0;$index -lt 40;$index++) {
  if ($server.HasExited) { throw 'Dedicated LLM server exited during startup' }
  try { $null=Invoke-RestMethod -Uri ($protocol.endpoint+'/api/version') -TimeoutSec 2; $ready=$true; break } catch { Start-Sleep -Milliseconds 250 }
}
if (-not $ready) { throw 'Dedicated LLM server did not become ready' }
$models=Invoke-RestMethod -Uri ($protocol.endpoint+'/api/tags') -TimeoutSec 5
$selected=$models.models | Where-Object name -eq $protocol.model
if ($selected.digest -ne $protocol.modelDigest) { throw 'Pinned model digest mismatch' }
$body=@{model=$protocol.model;keep_alive='1h';options=@{num_ctx=$protocol.contextTokens}} | ConvertTo-Json -Depth 4
$warm=Invoke-RestMethod -Uri ($protocol.endpoint+'/api/generate') -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 300
if ($warm.eval_count -gt 0) { throw 'A prompt-free load unexpectedly generated tokens' }
$runner=Get-CimInstance Win32_Process | Where-Object {$_.ParentProcessId -eq $server.Id -and $_.Name -eq 'llama-server.exe'}
$expectedParallelism='-np '+[string]$protocol.serverParallelism+'(?:\s|$)'
if ($runner.Count -ne 1 -or $runner.CommandLine -notmatch $expectedParallelism) {
  Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
  throw 'Actual runner parallelism differs from the preregistered configuration'
}
@{schema='genos.llm-server-ready/v1';server=$receipt;runnerId=$runner.ProcessId;runnerCommand=$runner.CommandLine;
  model=$selected;warmup=$warm;readyAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $AuditDirectory 'server-ready.json') -Encoding utf8
Write-Output ('Dedicated LLM server ready on '+$protocol.endpoint+' with '+$protocol.serverParallelism+' slots')
