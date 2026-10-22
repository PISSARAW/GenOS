# ADR 0722 — Morphogenèse de sécurité CyberCorp et retenue de l'architecture la plus simple

- **Statut** : Accepté
- **Date** : 2026-10-22
- **Domaine** : morphogenèse, topologies CyberCorp, résilience, parcimonie architecturale
- **Décideurs** : mainteneurs GenOS
- **Lié à** : ADR 0700, ADR 0702, ADR 0720, ADR 0721

## Contexte

Dans CyberCorp, chaque famille topologique répond à un besoin d'investigation
distinct :

| Topologie | Usage pertinent dans CyberCorp |
| --- | --- |
| A-Team | Répartir les tâches entre spécialistes |
| Trinity | Comparer trois hypothèses d'incident |
| Biocénose | Délibération, désaccord et abstention |
| Rhizome | Propager les découvertes entre analyses liées |
| Syncytium | Construire un état d'investigation partagé |
| Holobionte | Encadrer les outils et adaptateurs sous contrôle immunitaire |
| Biome | Allouer CPU, RAM, tokens et temps |
| Métapopulation | Comparer des investigations isolées sur plusieurs environnements |

Déployer une topologie multi-agents sans la comparer à une exécution simple
expose à une complexité inutile ou à une dégradation de fiabilité.

## Décision

`backend/src/services/morphogenesis/securityMorphogenesis.js` associe chaque
besoin de mission CyberCorp à sa topologie (`matchTopologyToMission`) et évalue
chaque forme contre deux références sur le **même corpus**, le **même budget**
(`cpuMs`, `ramMb`, `tokens`, `cycles`, `timeMs`) et les **mêmes critères de
réussite** :

1. un **agent unique** (`runSingleAgent`) ;
2. un **pipeline déterministe** (`runDeterministicPipeline`).

Lorsque six agents produisent une réponse moins fiable qu'un seul agent ou que
le pipeline déterministe (`topologyReliability < baselineReliability`),
`retainSimplestArchitecture` retient l'architecture la plus simple (`direct`).

## Invariants de résilience et de sécurité

- **Perte de worker** (`simulateWorkerLoss`) : les reçus archivés restent
  disponibles, tandis que `activeReceipts` distingue ceux des workers encore
  actifs. Chaque hash de provenance engage l'identifiant, le worker, la méthode,
  les empreintes d'entrée et de sortie et les permissions.
- **Panne du modèle** (`simulateModelFailure`) : l'erreur `MODEL_FAILURE` reste
  isolée au nœud défaillant sans corrompre les reçus ni élargir les droits des
  autres workers.
- **Désaccord et conflit d'état** (`detectDisagreement`, `detectStateConflict`) :
  toute divergence entre topologies ou écriture contradictoire sur une clé
  partagée est détectée explicitement.
- **Reprise** (`testRecovery`) : la reprise préserve la chaîne des reçus
  antérieurs et nouveaux tout en maintenant la frontière de permissions
  (`assertNoPermissionEscalation`).
- Les comparaisons gardent les workers inactifs dans le résultat, valident le
  compte de workers et comparent structurellement corpus, budget et critères.
  Les conflits d'état sont comparés sans dépendre de l'ordre des clés JSON.

## Validation

- `backend/tests/test_security_morphogenesis.js` vérifie les 8 correspondances
  CyberCorp, la comparaison à corpus/budget/critères identiques contre l'agent
  unique et le pipeline déterministe, la retenue de l'architecture la plus
  simple quand 6 agents sont moins fiables qu'un seul, ainsi que la perte de
  worker, la panne du modèle, le désaccord, le conflit d'état et la reprise sans
  perte de provenance ni escalade de permission.
