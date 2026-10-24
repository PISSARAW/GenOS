# Benchmark d'économie de communication

Ce protocole compare les mêmes tâches et les mêmes graines sur quatre bras :
diffusion naïve, GenOS zero-text, GenOS D-full et traces AgentSociety importées.
Le pilote cible 10 agents et 100 tâches ; les échelles 100 et 1 000 agents sont
définies dans `protocol.json`. Les traces doivent provenir de systèmes exécutés
avec le même modèle et le même fournisseur. Le projet ne lance pas AgentSociety
et ne déclenche pas d'appels modèle par défaut.

## Import et rapport

Préparer un manifeste JSON contenant une entrée par bras, scénario et graine :

```json
{
  "campaignId": "pilot-2026-01",
  "entries": [{
    "sourceSystem": "agentsociety",
    "tracePath": "agentsociety-seed-7.jsonl",
    "runId": "as-7",
    "armId": "agentsociety",
    "scenarioId": "pilot-10x100",
    "seed": 7,
    "model": "model-id",
    "provider": "provider-id",
    "taskIds": ["task-001", "task-002"]
  }]
}
```

Le fichier JSONL contient une ligne par tâche. Chaque ligne inclut `runId`,
`armId`, `scenarioId`, `seed`, `taskId`, `model`, `provider`, `verification`,
`informationLost`, `usageReceipts`, `modelCallsComplete` et `modelCalls`.
Une vérification réussie doit nommer un `verifierId` indépendant. Les reçus
fournisseur portent les tokens d'entrée/sortie réellement rapportés et, si
disponible, le coût facturé. `episodeCostsUsd` précise les coûts de vérification,
mémoire, planification, retries, transport et calcul. `resourceUse` peut fournir
`cpuMs`, `gpuMs`, `vramBytes` et `energyJoules`.

```powershell
node benchmarks/communication-economy/run-campaign.cjs campaign-manifest.json
```

Le rapport refuse les bras manquants, les graines non appariées, les tâches
différentes, un modèle ou fournisseur différent, et les vérifications auto-
déclarées. La couverture de tokens reste `lower-bound` si l'inventaire complet
des appels ne correspond pas exactement aux reçus. Aucun token n'est déduit de
la taille du texte. Les deltas sont appariés par graine ; les intervalles à 95 %
utilisent un bootstrap percentile déterministe de 2 000 rééchantillonnages.

Les ablations exigent un adaptateur qui confirme le mécanisme réellement désactivé
et relance le même jeu de tâches. Un résultat contrefactuel dérivé de traces ne
compte pas comme ablation exécutée.
