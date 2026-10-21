# ADR 0712 — ResidentDaemon comme système sensoriel de l’Ontogenèse

- **Statut** : accepté
- **Date** : 2026-10-21
- **Portée** : `backend/src/services/ontogenesis/daemonSensorySystem.js`, boucle et runtime Ontogenèse
- **Lié à** : ADR 0034, ADR 0235

## Contexte

L’Ontogenèse dispose d’une boucle durable, d’un backlog, de réveils et de gates
d’intégration. Le `ResidentDaemon` dispose de la connaissance territoriale,
des findings, des marqueurs stigmergiques et de dix phénotypes écologiques.
Le pont de production annonçait déjà l’entrée d’un orchestrateur et pouvait
fournir un `TerritoryBrief`, mais la boucle résidente ne consommait pas elle-même
un état sensoriel structuré avant de décider.

Créer des daemons spécialisés par mission confondrait observation durable et
exécution bornée. À l’inverse, laisser les données daemon hors de la boucle
empêcherait l’Ontogenèse de réagir aux changements du territoire.

## Décision

Un projet Ontogenèse observe, à chaque tick, le `ResidentDaemon` déjà associé à
son `root_path`. Cette lecture produit un objet
`genos.ontogenesis-daemon-sensory/v1` contenant :

- identité et HEAD du territoire ;
- fraîcheur de l’index et liveness du daemon ;
- phénotypes actifs et pressions mesurées ;
- findings non terminaux liés au HEAD courant ;
- marqueurs d’attention bornés ;
- recommandations de topologies déterministes.

L’objet porte explicitement `authority: advisory`, `mayAuthorize: false` et
`mayPromote: false`. Il ne crée pas de tâche et ne modifie aucun fichier.

Un changement sensoriel actionnable et indexé sur le HEAD courant produit au plus un événement Ontogenèse
`wake`, dédupliqué par empreinte. Cet événement peut réveiller un projet `IDLE`,
mais ne contourne ni une pause opérateur, ni les claims, ni les budgets.

Avant dispatch, les phénotypes actifs réordonnent seulement les topologies déjà
autorisées et admissibles. Les filtres de capacités, de ressources et d’échecs
restent souverains. L’instantané complet est transmis à la mission comme contexte
non fiable à vérifier ; les gates de preuve et l’intégrateur restent inchangés.

La vue d’activité expose un résumé sensoriel afin que l’absence, la péremption
ou la liveness du daemon soient observables.

## Correspondance des phénotypes

| Phénotype | Préférences de topologie |
|---|---|
| `security` | `trinity`, `biocenose` |
| `contract` | `trinity`, `metapopulation` |
| `dependency` | `metapopulation`, `trinity` |
| `documentation` | `a_team`, `trinity` |
| `historian` | `metapopulation`, `syncytium` |
| `chaperone` | `a_team`, `biocenose` |
| `metabolic` | `biome`, `rhizome` |
| `cross_repo` | `metapopulation`, `rhizome` |
| `repair` | `a_team`, `trinity` |
| `deep_research` | `rhizome`, `biome` |

Ces préférences sont des biais d’attention, pas des décisions. Une topologie
interdite ou incompatible ne redevient jamais admissible grâce au daemon.

## Conséquences

- L’Ontogenèse peut réagir à une observation territoriale sans polling cognitif
  ni création de daemon par mission.
- Le contexte de mission est lié au HEAD et les findings d’un ancien HEAD sont
  exclus de l’instantané actif.
- L’absence des tables ou d’un territoire daemon se dégrade en état
  `unavailable` sans bloquer la mission.
- Les propositions de backlog automatiques restent hors portée : elles exigent
  un contrat distinct de revue, déduplication et responsabilité.
- Les gains de chaque biais phénotypique doivent encore être mesurés ; leur
  présence ne démontre pas une meilleure décision.

## Preuves attendues

- test d’absence de territoire et dégradation gracieuse ;
- filtrage des findings par HEAD ;
- événement `wake` idempotent ;
- couverture des dix phénotypes et biais déterministes ;
- présence du résumé sensoriel dans la vue d’activité ;
- suites Ontogenèse et daemon existantes sans régression.
