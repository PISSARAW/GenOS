# ADR 0319 — Raccord des contrats philosophiques au cycle Ontogenèse

- Statut : Accepté
- Date : 2026-10-05
- Domaine : Ontogenèse, registre philosophique, expérimentation, preuve
- Décideurs : Équipe GenOS
- Lié à : [ADR 0235](0235-ontogenese-orchestrateur-resident-projet.md), [ADR 0238](0238-execution-et-integration-ontogenese.md), [ADR 0318](0318-contrats-implementation-concepts.md)

## Contexte

### Évolution du 2026-10-06

[ADR 0326](0326-audits-philosophiques-executables-et-preuves.md) ajoute au
transport initial une vérification comportementale bornée : les concepts
explicitement demandés exigent un manifeste lié à la mission et aux contrats,
avec valeurs lues dans des sources JSON confinées. Les références ajoutées pour
le contexte restent consultatives. L'intégrateur rejoue ces contrôles avant
`verified`, pendant l'intégration et à la récupération d'un commit ; une preuve
déclarée ou périmée ne suffit pas. Ce raccord n'atteste toujours pas la vérité
externe, l'utilité d'une théorie ou une validation indépendante. Il n'accorde
aucune lease ni promotion. Les sections suivantes conservent la décision initiale.

Le registre philosophique possède 375 contrats d’implémentation préparés pour
expérimentation. Avant cette décision, les contrats étaient consultables par le
routeur philosophique, mais le cycle Ontogenèse ne les transportait pas dans son
plan de capacité ni dans la requête du runtime harness.

Cette séparation rendait difficile la traçabilité entre un concept demandé par
une mission, le scénario prévu, la topologie comparée et les preuves attendues.
Le raccord ne doit toutefois pas transformer un mapping déclaratif en permission
runtime ou en promotion automatique.

## Décision

Le registre canonique attache à chaque concept philosophique :

- le contrat complet pour inspection et planification ;
- une référence compacte contenant maturité, scénario, expérience, preuves,
  topologies et `promotionEligible: false`.

`missionCapabilityPlanService` construit un bloc `philosophicalContracts` à partir
des concepts sélectionnés et résolus. Les entrées sont dédupliquées par
identifiant. Le plan conserve les concepts bloqués afin que leur absence de
disponibilité reste explicable.

`runtimeHarness` transmet ces références au runner dans `philosophicalContracts`
et rappelle que les preuves sont obligatoires avant promotion. Ce champ est un
contexte de mission ; il ne modifie ni leases, ni budgets, ni autorité, ni
branche, ni droits d’écriture.

## Invariants

1. Un concept philosophique reste `executable: false` dans le registre.
2. Une référence transportée reste `promotionEligible: false`.
3. Une topologie incompatible bloque la référence au lieu de l’autoriser par repli implicite.
4. Toute promotion exige les reçus appropriés et la gate générale d’Ontogenèse.
5. Les scénarios et expériences sont déterministes pour un concept compilé.
6. Les changements de contrat sont vérifiés par les tests du registre et du contexte de mission.
7. Le runner ne peut pas déduire une lease ou une permission depuis une métaphore philosophique.

## Contrat de données

```text
canonicalConceptRegistry
  → implementationContractReference
  → missionCapabilityPlan.philosophicalContracts
  → runtimeHarness.request.philosophicalContracts
  → observations / receipts
  → verification / integration gates
```

Le plan utilise les trois preuves minimales `scenario-input`, `scenario-output`
et `comparison-receipt`. Les seuils de maturité complémentaires sont gouvernés
par `assessContractPromotion` et les gates existantes ; ils ne sont pas remplacés
par ce raccord.

## Conséquences positives

- Le lien concept → scénario → mission → preuve est inspectable.
- Les 375 contrats peuvent être sélectionnés par une mission sans créer 375 modules.
- Les concepts bloqués restent visibles et diagnostiquables.
- La séparation entre préparation expérimentale et promotion est conservée.
- Les tests du contexte Ontogenèse protègent le transport des contrats.

## Conséquences négatives et limites

- Le plan de mission peut être plus volumineux lorsqu’une famille entière de
  concepts est sélectionnée.
- Le raccord ne produit pas de preuve runtime à lui seul.
- Les topologies et les comportements doivent encore être exécutés dans des
  campagnes comparables avant une maturité supérieure.
- Le snapshot GenOS utilisé pendant certaines sessions peut rester indisponible
  indépendamment de la validité des tests locaux ; cette limitation doit être
  signalée, jamais masquée.

## Alternatives rejetées

### Exécuter automatiquement chaque concept

Rejeté : cela confondrait un contrat préparatoire avec une capacité et imposerait
une sémantique unique à des interprétations philosophiques concurrentes.

### Copier seulement les identifiants dans le runner

Rejeté : l’identifiant seul ne transporte ni scénario, ni preuve attendue, ni
topologie de comparaison, et rend la mission moins auditable.

### Accorder une lease au concept philosophique

Rejeté : une lease dépend d’une capacité runtime et d’une autorité explicite,
jamais d’un mapping déclaratif.

## Vérification

Les commandes de référence sont :

```powershell
node backend/tests/test_ontogenesis_concept_registry.js
node backend/tests/test_ontogenesis_capability_plan.js
node backend/tests/test_ontogenesis_mission_context.js
node backend/tests/test_ontogenesis_developmental_runtime.js
node backend/tests/test_ontogenesis_strategy_bridge.js
npm --prefix backend run test:quality
```

La décision est respectée lorsque les tests passent et que les références
transportées restent non promouvables.
