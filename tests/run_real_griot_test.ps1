$model = "llama3.1:8b" # Fast small model
$apiUrl = "http://localhost:11434/api/generate"

function Test-Griot {
    param(
        [string]$TestName,
        [string]$SystemContext,
        [string]$UserPrompt
    )
    Write-Host "`n=================================================="
    Write-Host "REAL GRIOT TEST: $TestName"
    Write-Host "=================================================="
    Write-Host "System Context: $SystemContext"
    Write-Host "User Prompt: $UserPrompt"
    Write-Host "Waking up local model ($model)..."
    
    $prompt = "System: Tu es Griot, le routeur cognitif d'un framework biomimétique.
$SystemContext
User: $UserPrompt
Instruction: Réponds uniquement avec un objet JSON décrivant ton intention ('intent': string, 'target': string). Ne dis rien d'autre."

    $body = @{
        model = $model
        prompt = $prompt
        stream = $false; format = "json"
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri $apiUrl -Method Post -Body $body -ContentType "application/json" -TimeoutSec 300
        Write-Host "`n[GRIOT (Ollama)] -> $($response.response)" -ForegroundColor Green
    } catch {
        Write-Host "`n[ERROR] Impossible de contacter Ollama. Est-il lancé ? $_" -ForegroundColor Red
    }
}

Test-Griot -TestName "Test 1: Fuite Mémoire (Humain)" `
    -SystemContext "Le RAG t'informe que 'RAM explose' correspond au concept d'apoptose (destruction de ressource) ou 'analyze_memory_leak'." `
    -UserPrompt "Le backend plante après 3 heures d'utilisation, la RAM explose. Répare ça."

Test-Griot -TestName "Test 2: Concurrence (Agent)" `
    -SystemContext "Le RAG t'informe que 'Race condition' correspond au concept de flocking (synchronisation) ou 'fix_deadlock'." `
    -UserPrompt "ERROR: Race condition detected on Mutex<DatabasePool>. Deadlock timeout exceeded."

Test-Griot -TestName "Test 3: Autopoïèse (Agent)" `
    -SystemContext "Le RAG t'informe que 'Technical Debt > 95%' correspond au concept d'autopoïèse (réécriture) ou 'trigger_autopoiesis'." `
    -UserPrompt "CRITICAL: Technical Debt Index > 95%. Cyclomatic complexity threshold exceeded. Action required: Architectural Autopoiesis."
