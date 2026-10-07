# ADR 0351 — Provenance runtime des missions et références GVX

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Expérimentation, contrats et provenance

## Contexte

Les ADR [0349](0349-manifeste-experimental-gvx-et-provenance-p1.md) et
[0350](0350-cycle-immuable-des-claims-scientifiques.md) ajoutent un manifeste
GVX et le cycle scientifique. Les références initiales restent déclaratives ;
elles ne relient pas encore les missions persistées aux runs et reçus réels.
Le contrôle Meristem ne réserve pas alors le claim pendant son scellement.

## Décision

`gvxMissionProvenance` scelle dans le journal GVX existant une liaison entre
mission, run, contrat de stratégie, budget initial et tenant. Il utilise un
événement `decision_recorded` de kind `mission_run_binding` ; aucune base ni
table de mission supplémentaire n'est introduite. Le run et sa liaison sont
créés dans la même transaction de `strategyExecutionService`.

La mission doit être active, assignée à l'agent ou portée par son orchestrateur,
et appartenir au même tenant. Le contrat doit être retrouvé dans le registre
de stratégie avec la même version et le même contenu. La liaison contient
l'empreinte de l'objectif et celle du contrat combinés, le contrat sélectionné,
son propriétaire et le budget initial. Le lecteur compare les records actuels
à ces valeurs et vérifie la chaîne GVX. Un objectif, budget, scope ou contrat
altéré est refusé. Les identités de succession ne sont pas réécrites dans
l'historique ; l'autorité d'agir reste une vérification distincte, relevant de L02.

Les workers retrouvent leur mission depuis leur liaison biologique existante.
Les runs généraux utilisent `context.missionId`, déjà transmis par le parcours
de planification. Un ancien run sans mission ou tenant complet reste sans
liaison ; aucune mission ni autorité n'est inventée pour le compléter.

Le manifeste v1 accepte une extension compatible de `provenance.mission` :
`runtime: genos-node` avec `bindingHash`. Les deux champs doivent être présents
ensemble. Un manifeste sans ces champs reste déclaratif. Le marqueur runtime
impose la résolution de la mission et du run avant admission, relecture et
clôture. Le runner standard transmet la provenance explicite de son contexte
ou de son entrée, sans remplir ses références depuis des valeurs fictives.

`gvxManifestArtifacts` enregistre des bytes dans le magasin GVX adressé par
contenu, puis leur liaison dans le journal du scope. La résolution vérifie
le record, le kind, le hash et les bytes ; connaître un hash ne permet pas
de réutiliser le record d'un tenant étranger.

Les références de reçus runtime sont résolues depuis
`biological_worker_receipts`, avec vérification de la liaison biologique,
du tenant, de la mission, du statut réel du run et des observations appliquées.
Les coûts observés et leur indisponibilité éventuelle restent conservés.
La résolution expose `integrity: verified` et `postconditions: not_evaluated` :
elle n'accorde pas une preuve métier indépendante en lisant un champ
`result.verified` préexistant. Les autres familles de reçus restent à adapter.

Chaque claim runtime identifie son `scientificExperimentId`. Son énoncé
est vérifié par SHA-256 des bytes UTF-8 ; son expérience et le workspace sont
confrontés au tenant. L'inspection expose le statut déclaré à l'admission et
le statut scientifique courant, avec le dernier hash du cycle. Les décisions
et preuves historiques sont conservées. Une clôture observe un claim inactif
comme `blocked`, `source-claim-inactive`, sans promotion autorisée.

Les parents sont recherchés dans les manifestes effectivement enregistrés
dans le même scope, avec même mission et run déclaré. Une empreinte inconnue
ne peut plus se présenter comme un parent résolu dans le mode runtime.

## Transactions et rétractations

L'ajout d'une transition scientifique, la clôture GVX et le scellement
Trinity/Meristem utilisent le mécanisme `withTransaction` existant.
La transaction SQLite `BEGIN IMMEDIATE` couvre la lecture du cycle et la
publication du consommateur. Elle exclut les écritures concurrentes sur une
autre connexion ; la file par connexion empêche l'entrelacement de ces trois
parcours sur la même connexion. Les sondes suspendent la publication réelle
et montrent qu'une rétractation attend son commit avant d'être observée.

Un consommateur scellé avant une rétractation reste une observation historique.
Une tentative suivante de scellement avec un claim inactif est refusée.
La propagation vers tous les artefacts, souvenirs et lignages ne se déduit
pas de cette transaction ; elle reste à qualifier dans les lots concernés.

## Vérifications et limites

Le parcours de provenance utilise une base temporaire, une mission persistée,
le vrai exécuteur borné de subset-sum dans un processus séparé, puis un reçu
du chemin réel de traitement des événements. Un autre processus relit les
références et la rétractation. Les sondes couvrent hash ou scope modifiés,
source de claim étrangère, kind d'artefact modifié, budget altéré, parent
inconnu, compatibility sans liaison et clôture sous rétractation concurrente.
La sonde Meristem utilise son consommateur et ses artefacts SQLite réels.

Ces sondes qualifient l'intégration logicielle ; elles ne mesurent pas de gain
IA. Les versions de code et les prédictions restent déclarées dans ce lot.
La résolution des reçus Rust, distants et des postconditions des trois domaines,
l'enveloppe d'autorité commune, le replay causal, les campagnes et la parité
des interfaces restent nécessaires avant la clôture de P1. Les
[115 obligations P1](../06-qualite-preuves/obligations-cloture-p1.md) restent
suivies individuellement.
