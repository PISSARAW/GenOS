# Axolotl — Régénération fonctionnelle et cognitive

## Périmètre implémenté

Axolotl reconstruit une topologie endommagée et son contenu cognitif sous un
contrat fonctionnel fixé par l’orchestrateur. Les cinq pistes sont opérationnelles
pour le runtime natif Axolotl :

| Piste | Exécution disponible | Condition d’admission |
| --- | --- | --- |
| Contenu cognitif | Reconstruction de clés explicites depuis les mémoires épisodiques du parent ou des candidats déclarés | Probes de rappel avec résultats attendus et provenance conservée |
| Apprentissage pendant la régénération | Essais isolés successifs, refus des régressions, conservation des candidats rejetés | Contrat final complet réussi ; promotion idempotente au niveau L0 |
| Métamorphose contrôlée | Six états durables, budget de transitions, temporisation et hystérésis | Observations natives récentes, distinctes et liées au graphe actif |
| Coût de plasticité | Événements, durée réelle et changements du graphe ; comparaison stable/plastique | Au moins trois observations par mode, sous le même contrat |
| Régénération partielle | Ciblage de composants ou de rôles, remplacement local et réparation du routage | Composants sains préservés, frontières orientées conservées, contrat réussi |

L’admission concerne les comportements couverts par le contrat. Elle ne certifie
pas une mission LLM arbitraire ni la vérité générale d’une proposition cognitive.
Une promotion au-delà de L0 exige les gates habituelles de GenOS.

## Contrat et parcours

Le service `backend/src/services/axolotlRegenerationService.js` utilise la base
SQLite du backend. Le parent doit être un agent en mode `orchestrator`, dans son
workspace courant. Le plan exige une mission, une topologie valide et un contrat
avec des rôles requis et des probes de routage ou de rappel.

Exemple de contexte pour `plan_regeneration`, via `genos_execute_primitive` :

```json
{
  "orchestratorId": "parent",
  "mission": "Acheminer la requête et rappeler la règle sûre",
  "currentTopology": {
    "knowledge": { "rule": "incorrect" },
    "components": [
      { "id": "input", "role": "sensory_input" },
      { "id": "processor", "role": "processing", "status": "failed" },
      { "id": "memory", "role": "memory" }
    ],
    "connections": [
      { "from": "input", "to": "processor", "type": "route" },
      { "from": "processor", "to": "memory", "type": "route" }
    ]
  },
  "scope": { "type": "components", "componentIds": ["processor"] },
  "cognitiveScope": ["rule"],
  "preferredPreservation": [{ "key": "rule", "content": "safe" }],
  "functionalContract": {
    "requiredRoles": ["sensory_input", "processing", "memory"],
    "probes": [
      { "id": "delivery", "kind": "route", "from": "input", "to": "memory", "payload": "request", "expected": "request" },
      { "id": "recall", "kind": "recall", "key": "rule", "expected": "safe" }
    ]
  },
  "executionBudget": { "events": 1000, "durationMs": 10000, "experiments": 32 }
}
```

Vérifier le schéma de l’outil MCP pour placer ce contexte dans son enveloppe ;
les leases et le confinement du client restent applicables.

La stratégie `axolotl_regeneration` enchaîne `assess_regeneration`,
`plan_regeneration`, `prepare_cognitive_learning`, `execute_regeneration`,
`validate_equivalence` et `promote_cognitive_candidate`. Les primitives partagent
le contexte de pipeline : le plan transmet son `sessionId`, puis l’exécution
transmet la topologie admise. Un snapshot annoncé valide privilégie la restauration
classique si la panne n’est pas structurelle. Une stratégie inéligible reste
bloquée, y compris lorsqu’aucun autre candidat ne respecte le budget.

## Régénération structurelle et reprise

Le ciblage accepte `global`, `components` ou `roles`. Une identité logique
`originId` relie les générations successives ; les probes et messages peuvent
ainsi conserver leurs destinations d’origine. Les rôles et métadonnées sont
préservés. Les nouvelles routes passent par les composants remplacés ; les
composants sains restent inchangés. Une panne hors du périmètre couvert peut
faire rejeter le résultat.

Chaque session, preuve, observation, mode et topologie est stocké dans SQLite.
Les versions sont comparées dans une transaction : deux exécutions concurrentes
ne peuvent pas adopter deux résultats sur la même version source. Les statuts
sont `planned`, `executing`, `completed`, `rejected`, `failed` et `rolled_back`.
Une exécution interrompue devient reprenable après sa deadline. Une session
`failed` exige `retry: true`. Une session rejetée exige un nouveau plan.

`rollback_regeneration` restaure la topologie source et désactive les traits L0
issus de la session. Il refuse d’écraser une génération adoptée ultérieurement.
Les anciennes sessions conservées dans l’état adaptatif restent des archives ;
sans propriétaire, contrat et preuve native, elles exigent un nouveau plan.

## Cognition et nursery

`cognitiveSourceRefs` accepte des couples `{ "memoryId": "…", "key": "…" }`.
Seules les mémoires épisodiques non purgées du parent sont admissibles. Leur
contenu et leur empreinte sont conservés. Les candidats doivent correspondre
à une clé de `cognitiveScope` couverte par une probe de rappel.

La nursery est un worker Node épinglé, avec des données JSON, une limite de
mémoire et une deadline. Elle exécute le noyau de routage/rappel sur une copie du
graphe. Elle ne reçoit ni code client exécutable, ni outils, ni credentials du
parent. Chaque candidat doit améliorer sa probe sans dégrader les probes déjà
réussies. L’adoption attend un dernier passage du contrat complet.

Les preuves contiennent les empreintes du contrat, du graphe, du code de nursery,
la session et l’identifiant d’exécution. Une simple validation structurelle, un
callback client ou le démarrage d’un worker ne suffit pas. Les essais refusés
restent consultables ; les candidats retenus sont promus une seule fois en L0.

## Métamorphose et coût

`request_metamorphosis` applique les transitions du régulateur : `NEOTENIC`,
`PLASTIC`, `DIFFERENTIATING`, `CONSOLIDATING`, `STABLE`, `EMERGENCY_PLASTIC`.
La consolidation exige deux observations positives récentes ; la stabilisation
en exige trois sur le graphe actif. Réutiliser une preuve ne multiplie pas les
observations. Le budget limite les transitions réussies, avec une fenêtre de
renouvellement et un délai entre changements.

`STABLE` et `CONSOLIDATING` bloquent les changements structurels, y compris le
service d’organisation dynamique. Une observation native d’échec peut autoriser
`EMERGENCY_PLASTIC` malgré la temporisation. `observe_axolotl` exécute le contrat
actif et conserve sa preuve ; une déclaration du client ne remplace pas ce test.

`axolotl_cost_report` agrège les coûts réellement observés et compare les durées
des probes sous les deux modes. La comparaison est descriptive : elle ne mesure
pas le coût de toutes les missions. Les tokens et dollars restent absents tant
qu’aucun producteur natif ne les mesure ; une valeur absente ne vaut pas zéro.

## Runtime, inspection et vérification

- `inspect_regeneration` expose la session et ses essais conservés.
- `axolotl_route` vérifie le routage actif et dépose un message persistant.
  `queued: true` signifie que le message est en attente.
- `axolotl_inbox` consomme atomiquement les messages destinés au composant logique.
  Une seconde lecture ne relivre pas le même message.
- `axolotl_recall` lit une clé du contenu cognitif actif.
- La composition biologique Axolotl utilise les composants et rôles admis.
  Sans régénération admise, son statut reste `awaiting_regeneration`.

La suite dédiée s’exécute avec `node backend/tests/test_axolotl_suite.js` et couvre
la reprise SQLite, la concurrence, la reconstruction cognitive, les preuves
altérées, le rollback, les budgets, la métamorphose, les messages persistants,
la composition et la sélection de stratégie.

Voir [ADR 0325](../../adr/0325-regeneration-axolotl-executable.md).