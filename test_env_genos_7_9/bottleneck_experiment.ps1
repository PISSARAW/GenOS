# bottleneck_experiment.ps1 - parc de 10 capsules à génomes distincts -> désastre -> repeuplement.
$genos = "..\target\debug\genos.exe"
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 1. Population initiale : 10 agents, exploration uniformément réparti 0.05..0.95
$values = @(0.05,0.15,0.25,0.35,0.45,0.55,0.65,0.75,0.85,0.95)
$ids = @()
for ($i = 0; $i -lt 10; $i++) {
  $yaml = "agents/pop_agent_$i.yaml"
  & $genos agent create --name "PopAgent$i" --role Worker --out $yaml 2>$null
  if ($values[$i] -ne 0.7) {
    $delta = $values[$i] - 0.7
    & $genos agent mutate $yaml --drive "exploration=$([math]::Round($delta,2))" --out $yaml 2>$null | Out-Null
  }
  & $genos snapshot create --agent $yaml --out "snap_pop_$i.json" 2>$null | Out-Null
  & $genos capsule create --snapshot "snap_pop_$i.json" --root .genos79 --budget-steps 20 2>$null | Out-Null
}
$capsules = Get-Content .genos79\capsules\agent-world-capsules.jsonl | ForEach-Object { $_ | ConvertFrom-Json }
"population initiale: $($capsules.Count) capsules"
$capsules | ForEach-Object { $e = $_.agent_snapshot.genome.cognition.chromosomes[0].loci | Where-Object gene_name -eq 'exploration'; "  $($_.capsule_id.Substring(0,8)) exploration=$($e.value)" } | Sort-Object

# 2. DÉSASTRE : on en garde exactement 2 au hasard (tirage réel).
$rng = [System.Random]::new()
$survivors = $capsules | Get-Random -Count 2 -SetSeed $($rng.Next())
$victims = $capsules | Where-Object { $_.capsule_id -notin $survivors.capsule_id }
# Suppression physique des lignes des victimes dans le store append-only.
$keepIds = $survivors.capsule_id
$lines = Get-Content .genos79\capsules\agent-world-capsules.jsonl | Where-Object {
  $id = ($_ | ConvertFrom-Json).capsule_id; $id -in $keepIds
}
Set-Content .genos79\capsules\agent-world-capsules.jsonl -Value $lines
"désastre: $($victims.Count) capsules tuées, survivants:"
$survivors | ForEach-Object { $e = $_.agent_snapshot.genome.cognition.chromosomes[0].loci | Where-Object gene_name -eq 'exploration'; "  $($_.capsule_id.Substring(0,8)) exploration=$($e.value)" }

# 3. REPEUPLEMENT : chaque survivant produit 4 enfants par bourgeonnement (division asexuée).
foreach ($s in $survivors) {
  for ($b = 1; $b -le 4; $b++) {
    & $genos division bud $s.capsule_id --label "repop-$b" --steps 5 --root .genos79 2>$null | Out-Null
  }
}
$after = Get-Content .genos79\capsules\agent-world-capsules.jsonl | ForEach-Object { $_ | ConvertFrom-Json }
"population après repeuplement: $($after.Count) capsules"
$explorations = @()
$after | ForEach-Object {
  $e = ($_.agent_snapshot.genome.cognition.chromosomes[0].loci | Where-Object gene_name -eq 'exploration').value
  $explorations += [double]$e
  "  $($_.capsule_id.Substring(0,8)) parent=$($_.parent_capsule.id.Substring(0,8)) exploration=$e"
}

# 4. MÉTRIQUE DE DIVERSITÉ : variance et valeurs distinctes avant/après.
$mean = ($explorations | Measure-Object -Average).Average
$variance = (($explorations | ForEach-Object { [math]::Pow($_ - $mean, 2) }) | Measure-Object -Sum).Sum / $explorations.Count
$distinctBefore = ($values | Sort-Object -Unique).Count
$distinctAfter = ($explorations | Sort-Object -Unique).Count
"DIVERSITÉ: valeurs distinctes avant=$distinctBefore après=$distinctAfter ; variance(exploration) après=$([math]::Round($variance,5))"



