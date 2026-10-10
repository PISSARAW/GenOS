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

Le banc crée une clé AEIS éphémère si aucune n'est fournie et conserve les snapshots sous le dossier de sortie. La clé n'est écrite dans aucun reçu. `score.cjs` exige désormais 19 artefacts, 19 décisions vérifiées et la complétion du sous orchestrateur ; un code de sortie non nul signale les travaux restant à faire. Le score de syntaxe d'artefact reste distinct de celui de l'attention.

La première campagne sans clé a créé 19 workers, validé 18 artefacts et bloqué les décisions sous `require_independent_verification`. Une sonde avec clé a terminé `bounded_worker` et l'enfant du sous orchestrateur ; les 18 autres types échouent à `ORACLE_DOMAIN_UNAVAILABLE`. Un artefact valide n'est donc **pas** une promotion ni une preuve générale d'attention. Le diagnostic est dans `docs/06-qualite-preuves/diagnostic-attention-workers.md`.

Après ce jalon, la matrice produit 19 artefacts valides et 11 décisions vérifiées. Sept méthodes restent hors du domaine natif ; `experimental_worker` dispose désormais d'une preuve LPT mais reste bloqué par `require_replay`. Le scorer passe 12/14 contrôles et sort avec un code d'échec. Le worker créatif combine deux indices attribués selon le but ; sa sélection passe les variantes de but et d'ordre. Ce calcul utilise des indices littéraux fournis, sans prétendre mesurer une interprétation sémantique ouverte. Les épreuves par rôle, le parcours MCP et l'ablation restent à compléter.
