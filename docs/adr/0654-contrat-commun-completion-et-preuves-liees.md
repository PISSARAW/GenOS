# ADR 0654 — Contrat commun de complétion et preuves liées

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Domaine** : orchestration, topologies, preuves, complétion
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0022b, ADR 0324, ADR 0385

## Contexte

La fermeture d'une mission biologique mélangeait deux niveaux d'autorité. Le service
Syncytium décidait à la fois de la cohérence de l'état partagé et du verdict transversal,
tandis qu'un contrat commun connaissait directement des invariants et un oracle. Cette
imbrication appliquait aussi le finaliseur Syncytium à des topologies qui ne partagent
ni son état CRDT ni sa règle de matérialisation.

Le contrat commun acceptait en outre une référence conforme à la forme
`sha256:<hexadécimal>` sans exiger que la preuve existe, que son contenu corresponde au
digest et qu'elle soit liée à la mission et au worker évalués.

## Décision

Le verdict de complétion est séparé en trois responsabilités :

1. chaque topologie produit un résultat de validation réduit à `verified`, `partial` ou
   `failed`, à partir de ses propres oracles et invariants ;
2. un collecteur commun charge les reçus durables des workers et expose leur contenu au
   contrat de complétion ;
3. le contrat commun vérifie l'état terminal, les workers requis et chaque preuve par
   existence, recalcul du digest, liaison à la mission, liaison au worker et résultat
   vérifié. Il émet un verdict unique : `succeeded`, `failed`, `partial`, ou
   `in_progress` avant la terminaison.

L'adaptateur Syncytium reste seul responsable de la validation sémantique, des invariants
de l'état partagé, de la réconciliation des répliques et de la matérialisation courante.
Il transmet uniquement leur résultat agrégé au contrat commun. Les autres topologies ne
passent plus par ce service.

### Précision d'implémentation : contrat structurel et gate de clôture

Le raccord ultérieur conserve `missionCompletionContract` comme contrat
structurel : cycle de vie, roster, statuts, preuves liées, validation
topologique et barrière. Ce module ne décide aucune promotion et retourne
`promotionEligible: false`.

`missionClosureService` compose ce résultat avec quatre contrôles explicites :
workers requis, preuves admises, invariants et oracle indépendant. Son succès
rend la mission techniquement éligible à une étape de promotion sans exécuter
cette promotion. Les modes biologiques non-Syncytium utilisent cette gate ;
Syncytium conserve l'appel structurel après l'agrégation de ses propres
invariants et de son oracle de session.

Cette séparation évite deux dérives : charger le contrat structurel de la
sémantique de toutes les topologies, ou considérer une preuve worker intacte
comme un oracle indépendant de la décision produite.

Le schéma commun est `genos.mission-completion/v1`. Il expose le cycle de vie, le
verdict, le caractère terminal, les membres requis et terminés, les références de preuve
admises et les motifs. `success` est dérivé uniquement de `verdict === "succeeded"` et
`promotionEligible` reste `false`.

Une liste vide de membres requis est invalide. Cette règle évite qu'une mission sans
worker réussisse par vérité vacante, tout en obligeant chaque adaptateur à déclarer son
roster réel.

## Conséquences

### Positives

- Une règle Syncytium ne peut plus devenir implicitement une règle de toutes les
  topologies.
- Un digest syntaxiquement valide mais absent, altéré ou lié à une autre mission produit
  un résultat partiel.
- La convention de verdict ne dépend plus du vocabulaire interne d'une topologie.
- Les reçus de workers restent l'autorité durable ; le transport ou le statut du
  processus ne suffit pas.

### Négatives

- Toute nouvelle topologie doit fournir explicitement son adaptateur de validation.
- Les tests de complétion doivent construire ou persister un reçu réellement lié à la
  mission ; une chaîne SHA-256 factice ne suffit plus.
- Le champ historique `status` reste projeté pour compatibilité, mais le champ
  `completionContract.verdict` constitue l'autorité du verdict final.

## Implémentation et preuves

La décision est portée par :

- `backend/src/services/missionCompletionContract.js` pour l'automate commun ;
- `backend/src/services/missionCompletionEvidenceService.js` pour la relecture des
  reçus biologiques ;
- `backend/src/services/syncytiumMissionCompletionService.js` pour la cohérence et la
  matérialisation Syncytium ;
- `backend/src/services/biologicalMissionCompletionService.js` pour la sélection de
  l'adaptateur topologique.

La [référence du contrat](../03-reference/contrat-completion-mission.md) décrit les
schémas et motifs. Le [runbook](../04-exploitation/cloture-missions.md) décrit le
diagnostic sans mutation des preuves. La
[qualification du 2026-10-20](../06-qualite-preuves/qualification-contrat-completion-2026-10-20.md)
conserve les tests, contre-preuves et limites du relevé.

## Alternatives

### Conserver les invariants dans le contrat commun

Rejeté : le contrat transversal connaîtrait la sémantique d'une topologie et évoluerait
à chaque ajout d'oracle spécialisé.

### Faire confiance aux références fournies par les workers

Rejeté : une référence bien formée ne prouve ni l'existence du reçu, ni son intégrité,
ni sa corrélation avec la mission exécutée.

### Déclarer la matérialisation Syncytium comme verdict final

Rejeté : un snapshot courant prouve une propriété de l'état partagé, pas la présence ni
la validité des preuves de tous les workers requis.

### Fusionner tous les oracles dans un service transversal

Rejeté : le service deviendrait un second orchestrateur topologique, couplerait les
évolutions des variants et rendrait l'autorité de chaque invariant ambiguë.
