# Attention des workers GenOS

Ce banc lance les 19 types déclarés dans `workerKindService.KINDS` par le vrai flux `createAutonomousWorkers` → `agentRuntimeAdapter.startMission`. Il crée un parent, une mission, un workspace et une base SQLite isolés pour chaque type. Il conserve l'événement `EVIDENCE_REPORT`, le statut d'exécution et la validation du contrat d'artefact. Le sous orchestrateur est autorisé à créer son vrai child ; le résultat de ce child est aussi conservé.

Les données et dossiers générés restent **hors du dépôt**. Le dossier de sortie doit être un chemin absolu et accessible en écriture. Exemple PowerShell :

```powershell
npm ci --prefix backend --offline
$resultRoot = 'D:\GenOS-attention-tests'
$types = node -e "const path=require('node:path'); const k=require('./backend/src/services/agents/workerKindService').KINDS; console.log(Object.keys(k).join(' '))"
foreach ($kind in $types.Split(' ')) {
  node benchmarks/attention-workers/run.cjs $kind $resultRoot
}
node benchmarks/attention-workers/score.cjs $resultRoot
```

Lancer chaque type dans un **processus Node distinct** : le coupe circuit GenOS arrête les déploiements répétés après cinq appels dans un même processus. Le script écrit `outputs/real-worker-<type>.json` et crée ses bases et capsules sous `work/` du dossier de sortie. Il ne modifie pas les fichiers du dépôt.

`score.cjs` vérifie la création des 19 types, les artefacts produits, le vrai child du sous orchestrateur et huit épreuves structurées avec distracteurs : recherche littérale, seuil, somme contrainte, désaccord entre sources, lien causal et transfert pédagogique. Le score de syntaxe d'artefact est séparé du score d'attention. Les autres types exécutent une méthode réelle, mais leur fixture actuelle ne fournit pas encore une épreuve discriminante de pertinence.

Les reçus de la campagne du 10 octobre 2026 montrent 19 workers persistants créés, 18 artefacts valides et un child valide pour le sous orchestrateur. Les 18 exécutions avec artefact sont `blocked` par `require_independent_verification` ; le parent sous orchestrateur est `failed` parce que son child n'a pas de complétion vérifiée. Un artefact valide n'est donc **pas** une promotion ni une preuve générale d'attention. Le plan de qualification est dans `docs/06-qualite-preuves/diagnostic-attention-workers.md`.
