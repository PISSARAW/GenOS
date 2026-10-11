# Snapshots topologiques : contrat de capture et de reprise

- **Statut** : implémenté pour les huit adaptateurs ci-dessous ; reprise collective non prise en charge.
- **Portée** : routes REST de snapshot et de commit d'état d'agent, puis restore, checkout et reset de ces snapshots.
- **Dernière revue** : 2026-10-10.
- **Décision** : [ADR 0385](../adr/0385-contrat-snapshot-topologique.md).
- **Capsules de workers** : [ADR 0395](../adr/0395-workspaces-prives-pour-capsules-de-workers.md).

Implémentation : [contrat de scellement](../../backend/src/services/topologySnapshotContract.js),
[service commun](../../backend/src/services/topologySnapshotService.js),
[sélection des adaptateurs](../../backend/src/controllers/lineage/topologySnapshots.js)
et [routes Lineage](../../backend/src/controllers/lineage/snapshots.js).

## Surface et frontières

`POST /api/agents/snapshot` et `POST /api/agents/commit` acceptent le champ
optionnel suivant, en plus des paramètres habituels de l'agent :

```json
{
  "agentId": "agent-1",
  "topologySnapshot": {
    "topologyId": "trinity",
    "variantId": "controlled",
    "sessionId": "experiment-1"
  }
}
```

Seules ces trois clés sont acceptées dans `topologySnapshot`. L'agent, son
workspace et la portée tenant viennent de la route authentifiée. L'adaptateur
revérifie leur lien avec la session persistée ; la requête ne peut pas fournir
elle-même le contenu collectif à capturer. L'option ne s'applique pas aux
captures directes de `workspaceSnapshotStore`, aux objets `agentGitService` ni
aux autres parcours qui n'appellent pas ces routes.

La réponse de capture ou de commit inclut `topologySnapshot` et
`organismSnapshot`. Le manifeste topologique a `schemaVersion: 1`,
`policyVersion`, les cinq `bindings` (topologie, variant, session, agent,
workspace), une `boundary`, des `components` et un `hash` SHA-256. Chaque
composant a un identifiant, un statut et sa propre empreinte :

| Statut | Sens |
| --- | --- |
| `captured` | Petite valeur dérivée du serveur, incluse dans `payload`. |
| `reference-only` | Empreinte ou frontière d'un état collectif conservé en place ; aucune copie restaurable. |
| `unsupported`, `conflict` | Capture refusée avec `TOPOLOGY_SNAPSHOT_UNAVAILABLE`. |

Le manifeste est inclus dans l'empreinte du snapshot d'organisme. Un snapshot
avec topologie utilise la version 5 du manifeste d'organisme et la version 6 de
`_genosSnapshot` ; sans cette option, les versions 4 et 5 restent employées.
Les empreintes détectent une modification de données ; elles ne constituent
pas une signature indépendante de SQLite.

## Nouveaux workspaces de workers

Chaque capsule isolée d'un worker ordinaire est désormais enregistrée comme
workspace privé avant son exécution. L'agent pointe vers cette capsule ; sa
portée organisation/projet est héritée du workspace parent. Trinity conserve
son workspace de monde scellé. Lorsqu'un worker est réutilisé, sa nouvelle
capsule reçoit un autre identifiant et les snapshots de l'ancienne capsule
gardent leur cible d'origine. Le nettoyage automatique conserve une capsule
tant qu'un agent y est rattaché ou qu'elle porte des snapshots de workspace,
y compris leur payload de fichiers.
Le démarrage vérifie l'enregistrement de nettoyage et le marqueur d'époque de
la capsule avant d'accorder la délégation Cedar du parent. Le garage et les
sous-workers à délégation bornée utilisent la même frontière.

La création du workspace ne produit pas de snapshot topologique automatique.
Il faut demander `POST /api/agents/snapshot` ou `/commit` avec
`topologySnapshot`, puis satisfaire les vérifications de l'adaptateur pour la
session et le variant. Les capsules créées avant ce rattachement ne sont pas
migrées automatiquement. Un ancien snapshot ne peut pas être restauré dans le
nouveau workspace, puisque son identité et son chemin diffèrent.

`POST /api/agents/restore`, `/checkout` et `/reset` vérifient l'intégrité,
l'identité et la frontière topologique **avant** la restauration du workspace,
puis recapturent cette frontière avant la validation SQLite. Une dérive des
composants, une session active selon sa politique, un bail encore actif ou
une preuve manquante refusent la reprise. La réponse acceptée contient
`topologySnapshot.allowed: true`, `restorable: false` et un plan `verify-only`.
Seuls l'agent et son workspace suivent alors la restauration d'organisme ;
aucune session, aucun vote, graphe partagé, CRDT, effet d'outil ou état régional
n'est rembobiné. Une restauration d'un ancien snapshot sans manifeste suit le
contrat historique. Les opérations sur fichiers, SQLite, Rust et services
externes ne forment pas une transaction distribuée unique.

## Preuves vérifiées par topologie et variant

Les noms ci-dessous sont les valeurs `variantId` du contrat. Sauf indication
contraire, `default` demande le variant persisté ; Trinity l'interprète comme
`controlled`. Pour Métapopulation, fournir le nom du variant persisté (les
tirets sont normalisés en `_`). Syncytium vérifie le nom via son registre de
politiques, sans alias `default` documenté.

### Trinity — `topologyId: trinity`

L'agent doit appartenir au monde de l'expérience et au même workspace. La
baseline scellée est recalculée depuis les fichiers ; les mondes, transitions,
journal de phases et budget sont liés à la frontière. La reprise exige une
expérience terminale (`promoted`, `rejected`, `escalated` ou
`promotion_failed`).

| Variant | Entrée propre au variant scellée |
| --- | --- |
| `controlled` | Trois mondes attendus et hash de départ commun. |
| `heterogeneous` | Affectations des modèles et politique de diversité. |
| `adversarial` | Politique d'interaction, départ scellé et phases adversariales. |
| `counterfactual` | Hypothèses, interventions et comparaison. |
| `factorial` | Seize cellules attendues et affectations. |
| `pareto` | Objectifs, profils et comparaison. |
| `jury` | Politique d'adjudication, configuration et phase du jury. |
| `recursive` | État de récursion, budget enfant et phase récursive. |
| `adaptive` | Budget et configuration de continuation. |
| `temporal` | Politique temporelle, horizons et comparaison. |
| `oracular` | Topologie des mondes, prédictions et comparaison. |
| `exploratory` | Configuration de diversité qualité, réplicas et phase `qd`. |

### A-Team — `topologyId: a_team`

Le membre, le TeamRun et le WorkGraph doivent être liés au workspace. Les
révisions, handoffs, preuves de graphe et bail du runner sont référencés. La
reprise exige un run terminal, sans bail d'exécution ni agent actif.

| Variant | Entrée propre au variant scellée |
| --- | --- |
| `expert_committee` | Expertise de chaque membre. |
| `pipeline` | Étages, nœuds achevés et handoffs. |
| `project_dag` | Couches, dépendances et étages des nœuds. |
| `cross_functional_pod` | Responsabilités possédées et consultées. |
| `boundary_spanner` | Contrats d'interface et propriétaires des frontières. |
| `matrix_team` | Matrice d'autorité et autorités des membres. |
| `tiger_team` | Commandement, mandat urgent et baux d'outils. |
| `incident_command` | Commandement, échéance et état de l'incident. |
| `multiteam` | Plan et contrats entre équipes. |
| `adaptive` | Phases et affectation des spécialistes. |
| `relay_team` | Handoffs, propriétaires et état du relais. |

### Biocénose — `topologyId: biocenose`

Le membre appartient à la communauté ou à sa mission. La constitution
engagée, son hash, les tours, événements, engagements et registres de décision
sont vérifiés. Une reprise exige une communauté terminale, sans agent ou bail
actif ; un jugement final et le nombre minimal de tours restent requis selon
le cas. Chaque variant référence les registres suivants :

| Variant | Registres propres au variant |
| --- | --- |
| `epistemic_jury` | Engagements, claims, jugements. |
| `delphi_community` | Engagements, mises à jour de croyance, événements. |
| `adversarial_assembly` | Arguments, dissensus, événements. |
| `forecasting_crowd` | Calibration, jugements. |
| `argumentation_community` | Claims, arguments, propriétaires des claims. |
| `polycentric_council` | Membres, événements, dissensus. |
| `byzantine_resilient_community` | Membres, événements, claims. |
| `minority_preserving_jury` | Dissensus, événements, jugements. |
| `representative_community` | Membres, événements, jugements. |
| `persistent_community` | Calibration, événements, jugements. |
| `human_ai_deliberation` | Événements, dissensus, jugements. |
| `hybrid_oracle_community` | Claims, événements, jugements. |

### Holobionte — `topologyId: holobionte`

L'agent est l'hôte de la session. Constitution, symbiontes, état immunitaire,
ressources, journal contigu, contrats, ledger et mémoire sont référencés.
La sélection du variant exige son reçu persisté. La reprise attend l'hôte
`QUIESCENT` ou `CLOSED`, sans essai d'admission `TRIAL`.

| Variant | Champs de session propres au variant |
| --- | --- |
| `organelle` | Graphe de dépendances, transmission. |
| `adaptive-microbiome` | Écologie, résidents. |
| `immune-critical` | Immunité, résidents. |
| `local-first` | Ressources, résidents. |
| `regenerative` | Dépendances, immunité. |
| `cloud-core/edge-symbionts` | Ressources, résidents, placement distant. |
| `edge-core/cloud-symbionts` | Ressources, résidents, placement distant. |
| `memory-rich` | Transmission, immunité. |
| `competitive-partner` | Écologie, contributions vérifiées. |
| `procedural` | État du variant, ressources. |
| `tool` | État du variant, ressources, effets d'outils. |
| `cloud-core/edge-sync` | État du variant, transmission, synchronisation distante. |

Les effets d'outils et l'état distant sont des références à vérifier par une
source indépendante ; cette opération ne les restaure pas.

### Syncytium — `topologyId: syncytium`

L'agent porte l'identifiant de session dans ses métadonnées persistées. Le
dernier snapshot CRDT matérialisé doit correspondre à l'état courant, à sa
version et à sa frontière causale. Les répliques ne doivent avoir ni opération
hors ligne en attente ni réconciliation inachevée. Le schéma et les champs
partagés propres au variant sont référencés :

| Variant | Champs requis du schéma |
| --- | --- |
| `hard` | Au moins un champ ou invariant. |
| `soft` | `antiEntropyLog`, `queuedDeltas`. |
| `code` | `files`, `tests`, `builds`. |
| `document` | `sections`, `comments`, `document_undo`. |
| `graph` | `graph_nodes`, `graph_edges`. |
| `transactional` | `budget`, `inventory`, `capacity`, `reservations`. |
| `epistemic` | `claims`, `evidence`, `refutations`. |
| `blackboard` | `events`. |
| `localFirst` | `offlineQueue`, `syncState`, `deviceReplicas`. |
| `speculative` | `branchRegistry`, `promotionLog`, `discardLog`. |
| `hierarchical` | Des domaines persistés. |
| `realtimeControl` | `controls`. |
| `humanAi` | `human.approvals`, `human.control`, `human.consent`, `human.audit`. |

Le manifeste n'autorise pas le rejeu ni la restauration du cytoplasme partagé.

### Rhizome — `topologyId: rhizome`

L'agent doit appartenir à la mission de la session. Le graphe, ses extrémités,
son journal contigu, sa révision, son budget et les résultats sont vérifiés.
La reprise exige `DORMANT` ou `QUARANTINED` et aucun bail de branche actif.

| Variant | État propre au variant |
| --- | --- |
| `exploratory` | Besoins actifs, lacunes, traces. |
| `routing` | Routes, résultats, traces. |
| `growth` | Limites de croissance, budgets, lacunes. |
| `resilient` | Cicatrices de réparation, routes, budgets. |
| `sparse` | Limites de croissance, budgets, routes. |
| `persistent` | Baux, portée, routes. |
| `ephemeral` | Portée, traces, oscillateurs. |
| `small_world` | Routes, croissance, réparations. |
| `private` | Portée, routes, réparations. |
| `cross_representation` | Routes, résultats, lacunes. |
| `procedural` | Routes, résultats, besoins actifs. |
| `self_healing` | Réparations, routes, budgets. |

### Métapopulation — `topologyId: metapopulation`

L'agent est lié à un dème et à son workspace dans une mission régionale.
La session doit être `QUIESCENT` ou `CLOSED`, sans effet en vol. La frontière
des événements, la révision, les dèmes, corridors, migrations, colonisations,
extinctions et cultures sont référencés. La politique persistée doit correspondre
au registre du variant.

| Variant | Registres propres au variant |
| --- | --- |
| `balanced` | Dèmes, corridors, migrations. |
| `resilient` | Heartbeats, extinctions, colonisations. |
| `exploratory` | Cycles, migrations, fitness. |
| `conservative` | Migrations, cycles. |
| `classic_patch` | Patches, colonisations, extinctions. |
| `island_search` | Cycles, fitness, migrations. |
| `heterogeneous_islands` | Dèmes, cultures, transmissions. |
| `source_sink` | Corridors, migrations, heartbeats. |
| `rescue_network` | Heartbeats, colonisations, extinctions. |
| `stepping_stone` | Corridors, migrations, transmissions. |
| `anti_synchrony` | Corridors, cycles, extinctions. |
| `federated` | Migrations, cultures, transmissions. |
| `ephemeral_patch` | Baux éphémères, patches, colonisations. |
| `persistent` | Baux daemon, mémoire daemon, fitness. |
| `evolutionary` | Fitness, cycles, dèmes. |
| `cultural` | Cultures, transmissions, phylogénie. |

### Biome — `topologyId: biome`

L'agent est lié à la session par `metadata_json.topologySessionId`. La capture
refuse un agent ou une écologie en exécution. L'écologie, l'environnement, la matrice biofilm,
les ressources et le journal contigu composent la frontière. La reprise exige
une écologie inactive ; l'environnement persistant, s'il existe, est référencé.

| Variant | État propre au variant |
| --- | --- |
| `resource` | Ressources, populations. |
| `exploration` | Opportunités, environnement. |
| `quality_diversity` | Niches, populations. |
| `successional` | Écologie, niches. |
| `resilience` | Ressources, écologie. |
| `persistent` | Écologie, environnement persistant. |
| `open_ended` | Niches, opportunités. |
| `adversarial` | Interactions, archive. |
| `knowledge` | Environnement, niches. |
| `compute` | Ressources, populations. |
| `multi_scale` | Populations, niches, écologie. |

Le composant du variant lie aussi l'empreinte de la sélection et de la
politique aux paramètres spécialisés : allocation pour `resource` et
`compute`, seuils d'environnement pour `exploration`, diversité pour
`quality_diversity`, phases pour `successional`, réserve pour `resilience`,
saisons pour `persistent`, croissance pour `open_ended`, course aux armements
pour `adversarial`, sources pour `knowledge` et échelles pour `multi_scale`.

## Diagnostic et vérification

Une sélection incomplète retourne `TOPOLOGY_SNAPSHOT_REQUEST_INVALID` ; une
topologie inconnue, une identité de session incohérente ou une frontière sans
preuve échouent fermé. `TOPOLOGY_SNAPSHOT_INTEGRITY_FAILED` indique une
empreinte altérée, `TOPOLOGY_SNAPSHOT_DRIFT` une modification depuis la capture,
et `TOPOLOGY_SNAPSHOT_PREFLIGHT_REFUSED` une reprise interdite par la politique
de la topologie. Les adaptateurs ont aussi leurs codes propres.

Après modification de l'agent ou du workspace, utiliser
`npm --prefix backend run test:topology-snapshots`. Les tests vérifient les
contrats des adaptateurs et le refus avant écriture de fichiers ; ils ne
constituent pas une preuve de reprise atomique des services externes.
