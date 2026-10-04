# ADR 0300 — Niche du spécialiste et contrat du symbiote en topologie

- **Statut** : Accepté
- **Date** : 2026-10-04
- **Domaine** : Topologies, workers spécialistes, Holobionte
- **Décideurs** : Équipe GenOS
- **Lié à** : ADR 0063, ADR 0064, ADR 0123

## Contexte

Une topologie pouvait sélectionner `specialist` sans transmettre de niche
au contrat persistant. La sélection de `symbiotic_worker` ne conservait pas
les paramètres d'autorité du Host. La persistance échouait ensuite, alors
que la composition annonçait ces workers comme affectés. Les étiquettes de
domaine de l'A-Team, telles que `frontend`, étaient aussi traitées comme
des capacités de runtime et rendaient leur rôle impossible à placer.

## Décision

- La niche du spécialiste est l'identifiant explicite du membre lorsqu'il
  existe, puis son rôle qualifié par la topologie. Elle est persistée dans
  `workerAssignment.nicheDomain` et vérifiée par le contrat du worker.
- Les rôles techniques de l'A-Team demandent `domain_specialization` ; leur
  domaine demeure une niche, pas un droit d'exécution supplémentaire.
- L'affectation d'un symbiote transmet `hostContractId`, `hostCapabilities`
  et `hostId` fournis par le membre ou ses exigences. Aucun Host ni droit
  n'est créé par défaut. La persistance refuse un symbiote sans contrat
  et capacités d'hôte explicites.

## Conséquences

Les spécialistes issus des topologies deviennent persistables et leur
domaine est vérifiable. Les compositions Holobionte dépourvues d'un contrat
Host restent descriptives : elles doivent recevoir un contrat réel avant le
dispatch du symbiote. Une étiquette de domaine A-Team ne peut plus être
confondue avec une capacité outil ou une autorité.

## Alternatives

- Inventer un contrat Host à partir du nom de rôle : rejeté, car le rôle
  ne prouve pas l'existence d'un Host ni une délégation de capacité.
- Élargir les capacités génériques du spécialiste à tous les domaines :
  rejeté, car cela masquerait la niche réelle de la mission.
