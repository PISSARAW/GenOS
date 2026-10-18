# GQWF v2 — Racines de fichiers et vues durables

- **Statut** : Partiel — noyau backend, workers autonomes, promotion Trinity et capture/restauration des fichiers d'organisme disponibles en opt-in.
- **Portée** : projection de fichiers, overlays, merge, matérialisation, tête versionnée.
- **Dernière revue** : 2026-10-18.

Le noyau [GQWF](../../backend/src/services/gqwf/index.js) ajoute une représentation
logique des fichiers sans remplacer les snapshots v1. Il suit l'[ADR 0369](../adr/0369-racines-gqwf-et-vues-durables.md).

| Objet | Stockage | Contrat |
| --- | --- | --- |
| Blob | `.genos/gqwf/blobs/<préfixe>/<sha256>` dans le workspace | Octets relus avec contrôle SHA-256 |
| Racine | `gqwf_roots` | Manifeste déterministe et politique de projection v2 |
| Vue | `gqwf_views` et `gqwf_changes` | Base immuable, overlay privé durable, version attendue |
| Tête | `gqwf_heads` et `gqwf_head_events` | Génération monotone et reçu de vérification |
| Bail | `gqwf_leases` | Dossier matérialisé puis ingéré ou libéré explicitement |
| Matérialisation | `gqwf_materialization_receipts` | Backend versionné, capacités observées et sélection liée au bail |
| Collecte | `gqwf_gc_runs` | Aperçu signé puis balayage explicite et traçable |
| Intégrité | `gqwf_integrity_runs` | Scrub exhaustif non destructif et rapport durable |

Le service expose `importBase`, `importLegacySnapshot`, `createView`, `readFile`, `listFiles`, `writeFile`,
`deleteFile`, `sealView`, `mergeRoots`, `materializeRoot`, `ingestLease` et
`releaseLease`. `inspectGarbage` fournit un aperçu sans mutation ;
`collectGarbage` exige le hash exact de cet inventaire. `scrubIntegrity`
vérifie le store complet et persiste son rapport sans réparer. `publishCandidate` échoue sans vérificateur injecté par le
runtime. Une écriture ou suppression exige `expectedVersion`; une publication
exige `expectedHash` et `expectedGeneration`.

Le premier raccordement à l'exécution paresseuse expose aussi
`openExecutionWorkspace`, `materializeExecutionWorkspace`,
`ingestExecutionWorkspace` et `releaseExecutionWorkspace`. L'ouverture crée une
vue logique sans dossier physique. La matérialisation explicite scelle cette vue
et ouvre un bail seulement lorsqu'un outil exige un chemin réel ; les fichiers
produits peuvent ensuite être réingérés comme nouvelle racine candidate avant la
libération du bail.

La tranche 2 sélectionne maintenant ce contrat pour les missions orchestrateur
supervisées qui demandent `executionPolicy.gqwfV2: true`. La copie initiale est
différée, puis le runtime reçoit le dossier matérialisé comme `cwd` et
`GENOS_WORKSPACE_ROOT`. Une réussite est ingérée comme candidate avant
libération ; un échec est libéré sans ingestion. La session durable
`gqwf_execution_sessions` lie l'execution run, la vue, le bail et la candidate.
Les runtimes déterministes ou in-process restent physiques, et aucune tête
n'est publiée automatiquement. Voir l'[ADR 0605](../adr/0605-routage-missions-supervisees-gqwf.md).

Le verdict de publication doit être lié au workspace, au nom et à la
génération de la tête, à sa racine précédente et à la racine candidate.
Les octets de chaque blob sont vérifiés avant le verdict puis avant le CAS.
Ce durcissement seul ne fournit pas de vérificateur runtime. La promotion
générale reste bloquée hors des parcours munis d'une vérification réelle.
Voir l'[ADR 0399](../adr/0399-liaison-recu-promotion-gqwf.md).

Le parcours Trinity peut désormais demander `executionPolicy.gqwfV2: true`.
Après les contrôles d'intégration et la vérification de la candidate, GenOS
importe sa projection de fichiers, inscrit sa racine dans les métadonnées d'un
objet AgentGit signé, puis déplace une tête `trinity/<expérience>` dans le
workspace source. La décision Trinity et l'événement de tête sont persistés
dans la même transaction SQLite. Une signature invalide, un reçu mal lié ou
des contrôles incomplets bloquent cette tête. Ce parcours ne remplace pas la
capsule physique et ne généralise pas encore la publication GQWF aux autres
workers. Voir l'[ADR 0400](../adr/0400-promotion-trinity-gqwf-opt-in.md).

La qualification de cette promotion exécute `promoteWinner` sur une base SQLite
réelle et un workspace physique. Elle couvre un test `npm` dans la candidate,
le même test dans une capsule de vérification indépendante, la signature
AgentGit, la tête et son événement GQWF, le rejeu après réouverture de la base,
le refus d'un test échoué, le rollback de la tête si la décision échoue après
publication et le refus d'un événement altéré. Le résultat de
comparaison est fourni par la fixture : ce test ne lance pas les trois workers
d'une mission Trinity complète. Sur Windows, la commande `npm` est résolue vers
son CLI Node pour l'exécution directe ; le vérificateur garde la commande
autorisée `npm test` et sa propre racine de confinement.

Validation : `node backend/tests/test_gqwf_trinity_mission_qualification.js`.

La création inscrit `preparing` avant le dossier, puis `open` après sa
matérialisation. La libération traverse `releasing` avant `released`. Un nouvel
appel à `releaseLease` reprend une suppression interrompue ; `materializeRoot`
réconcilie au plus 100 libérations en attente du même workspace et refuse une
nouvelle création si des préparations ou quarantaines subsistent.
`reconcileReleasingLeases` peut être appelé explicitement pour poursuivre le
nettoyage. Après arrêt des producteurs, `recoverPreparations: true` traite
aussi les préparations inachevées ; cette reprise reste explicite au
redémarrage. Un dossier sans marqueur de propriété est conservé en
quarantaine. Voir l'[ADR 0378](../adr/0378-reprise-des-baux-gqwf.md).

## Workers autonomes sous bail GQWF

Une mission peut activer `executionPolicy.gqwfV2: true`. Après création de sa
vue GQWF privée, GenOS matérialise directement sa racine sous bail : aucun
worktree ni copie intermédiaire n'est créé. Si l'orchestrateur parent s'exécute
déjà dans une vue matérialisée, le worker hérite de cette projection courante.
Le lien durable conserve la vue, le bail, le backend et la candidate dans
`gqwf_worker_bindings`. Le marqueur du bail et ces enregistrements fournissent
la preuve de possession exigée par le binding privé du worker.

À la clôture réussie, GenOS réingère les fichiers, inscrit leurs différences
dans la vue, conserve une `candidate_hash`, puis libère le bail. Un échec est
abandonné sans capture. Une erreur de capture ou de libération conserve un état
récupérable. La racine candidate ne modifie aucune tête publiée. Les workers
natifs déterministes, locaux ou in-process, les grandes cohortes et les missions
non opt-in gardent leurs capsules physiques. Voir l'[ADR 0608](../adr/0608-materialiser-les-workers-autonomes-par-bail-gqwf.md).

La tranche 4 expose `inspectWorkerCandidates` pour inventorier les racines
capturées d'un ensemble explicite de workers. Cette opération ne les classe pas
et n'en sélectionne aucune. `promoteWorkerCandidate` exige ensuite un choix
explicite et un vérificateur injecté dont le verdict lie la preuve au worker, à
sa vue, au workspace, à la base, à la candidate, à la tête et à sa génération.
Le CAS de tête, l'événement et le reçu `gqwf_worker_promotions` sont atomiques.
Le rejeu du même reçu est idempotent ; une tête devenue obsolète est refusée
sans merge implicite. Voir l'[ADR 0612](../adr/0612-promotion-explicite-candidates-workers-gqwf.md).

## Collecte explicite des objets inaccessibles

La tranche 5 ajoute un mark-and-sweep par workspace. Le marquage couvre toutes
les racines encore citées par une tête, une vue, un bail, une session, un
événement de tête, un lien historique, un worker ou un reçu de promotion. Les
blobs d'overlay sont également protégés directement. L'aperçu retourne les
racines et blobs orphelins, les octets récupérables et un hash d'inventaire.

L'application doit fournir ce hash ; l'inventaire est recalculé sous transaction
et toute différence impose un nouvel aperçu. Les chemins inattendus, liens,
hardlinks ou blobs corrompus sont conservés et bloquent la collecte. Les
écritures de racine et d'overlay revérifient leurs blobs sous transaction afin
qu'une course se termine par une référence protégée ou par un échec explicite,
jamais par une référence silencieusement cassée. Chaque collecte réussie laisse
un reçu `gqwf_gc_runs`. Rien n'est collecté automatiquement à la libération
d'un bail. Voir l'[ADR 0614](../adr/0614-collecte-explicite-racines-blobs-gqwf.md).

## Qualification comparative Copy-on-Write

La tranche 6 ajoute le protocole `gqwf-cow-paired-v1`. Il compare, sur les
mêmes octets déterministes, N copies physiques complètes à N vues GQWF qui
partagent une racine et un overlay identique. Trois répétitions au minimum sont
requises et l'ordre des deux bras alterne. Chaque paire conserve ses mesures
brutes et vérifie la parité des projections avant de contribuer au résumé.

Les latences, les octets de contenu et la taille physique SQLite sont rapportés
séparément. Le ratio de contenu n'absorbe donc pas silencieusement le WAL ou les
métadonnées. Le rapport déclare `performanceClaim: none` : une exécution locale
qualifie le comportement Copy-on-Write et le protocole, pas un gain universel
ni l'activation par défaut. Voir l'[ADR 0616](../adr/0616-qualification-appariee-copy-on-write-gqwf.md).

## Activation canari bornée

La tranche 7 permet à une mission orchestrateur de fournir
`executionPolicy.gqwfCanary` avec un `policyId`, un pourcentage entier en points
de base et un booléen `enabled`. L'organisation, le projet optionnel, le
workspace et la politique alimentent une affectation SHA-256 stable : toutes les
missions du même périmètre restent dans le même bras. Le bras canari active le
même chemin `gqwfV2` que l'opt-in manuel ; le bras contrôle conserve le backend
physique.

Chaque affectation est liée à l'execution run dans
`gqwf_rollout_decisions`, puis suivie comme `assigned`, `prepared`, `completed`
ou `failed`. `inspectRollout` restitue les décisions et les agrégats sans décider
d'une promotion. `GENOS_GQWF_CANARY_DISABLED=1` force les nouvelles affectations
vers le contrôle tout en laissant l'opt-in manuel disponible. Une panne canari
est remontée et auditée ; elle ne déclenche pas une seconde exécution physique,
afin de ne pas dupliquer d'éventuels effets externes. Le défaut global reste
physique. Voir l'[ADR 0618](../adr/0618-canari-determine-et-reversible-gqwf.md).

## Backend de matérialisation versionné

La tranche 8 isole la projection physique derrière un SPI versionné. GQWF reste
l'unique autorité sur les racines, vues, baux, preuves et promotions ; le
backend ne fait que matérialiser, capturer, libérer ou reprendre le dossier d'un
bail. `inspectMaterializers` expose les capacités détectées et
`inspectMaterialization` relit le reçu durable d'un bail.

La sélection d'un backend explicite est validée avant toute mutation. Chaque
bail lie ensuite l'identifiant du backend, la version du contrat, le hash des
capacités et la raison de sélection. Une capacité modifiée, un reçu altéré ou
un backend enregistré devenu inconnu bloque la suite du cycle de vie. Les baux
historiques sans reçu sont rattachés explicitement au backend portable pendant
leur reprise.

`portable-copy-v1` reste le seul backend de production : cette tranche fournit
la frontière et ses tests de conformité, pas encore un accélérateur reflink,
OverlayFS ou bloc. Deux implémentations conformes doivent produire la même
racine candidate pour la même projection. Voir l'[ADR 0628](../adr/0628-spi-materialisation-gqwf.md).

Validation ciblée du SPI :
`node backend/tests/test_gqwf_materialization_contract.js`.

### Reflink natif

La tranche 9 fournit `native-reflink-v1`, premier accélérateur physique du SPI.
Il exige un clone Copy-on-Write strict au niveau fichier et vérifie cette
capacité sur le filesystem du workspace. Un clone explicite indisponible échoue
sans créer de bail. La politique explicite `materializerId: auto` préfère ce
backend après les backends montés disponibles, puis choisit la copie portable,
avec les causes du fallback inscrites dans le reçu. Sans politique, le défaut
reste `portable-copy-v1`.

Les blobs et les fichiers clonés sont vérifiés par hash. Un hardlink ou une
cible non régulière est refusé. Cette tranche réduit les écritures initiales sur
un volume compatible, mais conserve les lectures d'intégrité et ne revendique
pas encore un gain universel. Voir l'[ADR 0629](../adr/0629-backend-reflink-natif-gqwf.md).

Validation ciblée : `node backend/tests/test_gqwf_reflink_materializer.js`.

### Politique de matérialisation des missions

La tranche 10 relie le SPI au chemin réel des missions. Une mission GQWF peut
déclarer `executionPolicy.gqwfMaterializer` avec `portable-copy-v1`,
`native-reflink-v1`, `linux-overlayfs-v1` ou `auto`. L'ingress orchestrateur
accepte aussi la forme `gqwf_materializer`, puis la normalisation conserve le
champ canonique. Une valeur inconnue, ou une politique sans activation GQWF ni
affectation canari, est refusée avant le provisionnement du workspace.

Le défaut reste `portable-copy-v1`. `native-reflink-v1` échoue avant la création
d'un bail si la sonde du volume est négative. `auto` autorise explicitement le
repli portable et en conserve la cause. Le descripteur `executionWorkspace`
expose `materialization.backendId`, `selectionReason`, `capabilityHash` et
`receiptHash` depuis le reçu durable du bail, y compris après sa libération ; il
ne déduit jamais le résultat depuis la politique demandée.

Cette politique traverse également le fan-out des workers, sans rendre GQWF
global ni modifier le bras contrôle d'un canari. Voir l'[ADR 0630](../adr/0630-politique-materialisation-missions-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_mission_materializer_policy.js`.

### Conteneurs de bail montables

La tranche 11 sépare désormais deux chemins durables. `gqwf_leases.path`
désigne le conteneur possédé par GQWF, qui porte le marqueur de bail ;
`execution_path` désigne uniquement la racine remise au runtime. Les nouveaux
baux utilisent l'enfant direct `root/`. La capture ne voit donc ni le marqueur,
ni les futurs fichiers de gestion d'un backend monté.

Le chemin d'exécution est confiné au conteneur et relu avant capture,
libération ou reprise. Les backends reçoivent à la fois `containerPath` et leur
racine de projection. Ils libèrent le conteneur, ce qui permettra à un backend
OverlayFS ou snapshot de démonter `root/` avant de supprimer ses métadonnées.
Les anciens baux sans champ distinct continuent à utiliser leur `path`
historique et reçoivent un reçu portable de compatibilité.

Cette tranche rend le cycle de vie montable ; elle n'annonce pas encore un
backend OverlayFS ou ZFS disponible. Voir l'[ADR 0631](../adr/0631-conteneur-bail-et-racine-execution-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_mount_ready_lease_layout.js`.

### OverlayFS Linux

La tranche 12 ajoute `linux-overlayfs-v1`. Une sonde active monte un overlay
éphémère dans le filesystem du workspace, vérifie la lecture du lower, le
copy-up d'une écriture et l'immutabilité du lower, puis exige un démontage
observé. Une plateforme non Linux, un chemin incompatible, une permission de
montage absente ou un démontage incomplet rendent la capacité indisponible ;
une sélection explicite échoue avant la création du bail.

Chaque hash de racine possède un cache lower partagé sous
`.genos/gqwf/overlay-lower/`. Sa preuve et chaque fichier sont relus et vérifiés
avant montage et avant capture. Chaque bail possède ses propres `upper/` et
`work/`, placés ensemble dans le conteneur, tandis que `root/` reste le point de
montage remis au runtime. La libération et la reprise démontent `root/` avant
toute suppression ; un échec laisse le bail en `releasing` et ses fichiers en
place pour une nouvelle tentative.

`auto` qualifie dans l'ordre OverlayFS, reflink, puis copie portable, et inscrit
toutes les indisponibilités traversées dans le reçu. Le défaut sans politique
reste `portable-copy-v1`. La tranche ne revendique aucun gain sans benchmark sur
le déploiement cible.
Voir l'[ADR 0632](../adr/0632-backend-overlayfs-linux-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_overlayfs_materializer.js`.

### Collecte des caches lower OverlayFS

La tranche 13 étend le preview signé du garbage collector aux caches
`.genos/gqwf/overlay-lower/`. Chaque entrée doit porter un nom de hash, une
preuve `.ready`, une racine privée sans symlink, hardlink ni fichier spécial.
Une entrée anormale bloque toute collecte et reste en place pour inspection.

Un cache est récupérable même si sa racine GQWF reste joignable : les blobs et
le manifeste permettent de le reconstruire. Il reste toutefois protégé tant
qu'un bail `linux-overlayfs-v1` n'est pas `released` ou que `/proc/self/mountinfo`
le montre comme lower d'un montage. Cette seconde protection couvre un décalage
entre l'état SQLite et le noyau.

L'état actif et monté participe au hash d'inventaire. `collectGarbage` reprend
un verrou d'écriture SQLite, recalcule cet inventaire puis revérifie taille et
montage immédiatement avant suppression. Une course ou un montage tardif
échoue sans supprimer le cache. Le reçu `gqwf_gc_runs` conserve désormais
`overlay_cache_count` et les octets récupérables incluent les caches supprimés.
Voir l'[ADR 0633](../adr/0633-collecte-caches-lower-overlayfs-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_overlayfs_cache_gc.js`.

### Qualification appariée des matérialiseurs

La tranche 14 ajoute le protocole local `gqwf-materializer-paired-v1`. Il
compare chaque accélérateur disponible à `portable-copy-v1` avec les mêmes
octets, la même mutation et une fixture froide distincte par bras. Trois
répétitions au minimum sont imposées et l'ordre accélérateur/portable alterne
pour limiter un biais systématique d'ordre.

Chaque bras couvre la matérialisation, une écriture, la capture et la
libération. Les hashes de la racine de départ et de la candidate capturée
doivent être identiques entre les deux bras. Un backend qui ajoute, perd ou
transforme silencieusement un fichier est donc classé `semantic_mismatch`,
même si ses temps sont meilleurs. Un backend absent ou dont la sonde échoue
est conservé dans `skipped` avec sa cause ; il n'est pas assimilé à une mesure.

Le rapport lie les mesures brutes à la révision, à l'état du checkout et à
l'environnement local. Il porte néanmoins `performanceClaim: none`,
`runtimePromotionAuthorized: false` et `autoPolicyChanged: false`. T14 ne
modifie donc pas l'ordre de sélection `auto` : une mesure locale ne suffit pas
à promouvoir une politique valable sur d'autres volumes, noyaux ou charges.
Voir l'[ADR 0634](../adr/0634-qualification-appariee-materialiseurs-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_materializer_benchmark.js`.

### Scrub d'intégrité du store

La tranche 15 ouvre le plan de récupération des garanties de stockage par le
protocole `gqwf-scrub-v1`. `scrubIntegrity` vérifie tous les manifestes de
racines, les blobs d'overlay et l'inventaire physique complet du store, y
compris les objets non référencés. Les hashes, tailles, hardlinks, symlinks et
formes de chemins sont contrôlés par le même scanner que la collecte.

Le résultat `healthy` ou `corrupt`, ses anomalies structurées et son
`inventoryHash` sont persistés dans `gqwf_integrity_runs`. Cette opération ne
répare et ne supprime rien : une future réparation devra prouver une source
redondante authentifiée. Voir l'[ADR 0635](../adr/0635-scrub-integrite-store-gqwf.md).

Validation ciblée :
`node backend/tests/test_gqwf_garbage_collection.js`.

La projection est limitée par les quotas de snapshots existants. Elle exclut
les mêmes chemins que les snapshots de workspace v1 et refuse les symlinks,
les hardlinks, les fichiers spéciaux et les noms non portables. Les modes
d'exécution sont assainis. Une racine n'est donc pas une image de build complète :
les dépendances et l'environnement d'exécution demandent une provenance distincte.

La capture et la restauration d'organisme gardent leur protocole de sécurité
historique. Le pointeur de checkpoint Rust et les missions partagées ne sont pas
pilotés par GQWF v2. Aucun gain de performance n'est revendiqué sans benchmark
sur import, fork, lecture, matérialisation, test et promotion.

Le pont v1 relit le manifeste historique avec son vérificateur existant et
conserve un lien `snapshot_id → root_hash`. GQWF reste une demande explicite
pour la capture et la restauration d'organisme.

Une capture ou un commit d'organisme peut demander `gqwfV2: true`. Après le
snapshot historique, GenOS importe son payload vérifié et couvre la racine
GQWF dans le hash du manifeste d'organisme. La réponse fournit
`gqwfRootHash`. Avant restauration, le lien entre snapshot historique et
racine est vérifié ; un lien manquant ou incohérent refuse la restauration.
Sans option, le payload historique reste la source et la réponse indique
`gqwfRootRestored: false`. Avec `gqwfV2: true` sur `restore` ou `checkout`,
GenOS vérifie la projection historique et les blobs, puis restaure les fichiers
depuis la racine avec snapshot de sécurité et rollback. La réponse indique
`gqwfRootRestored: true` seulement après une copie vérifiée. Le manifeste
historique reste nécessaire, mais ses octets de payload peuvent manquer. Ces
frontières sont décrites dans les [ADR 0378](../adr/0378-reference-gqwf-dans-snapshot-organisme.md)
et [0383](../adr/0383-restauration-opt-in-racine-gqwf-organisme.md).

Validation ciblée : `node backend/tests/test_gqwf_fabric.js`,
`node backend/tests/test_gqwf_worker_execution.js`,
`node backend/tests/test_gqwf_worker_promotion.js`,
`node backend/tests/test_gqwf_garbage_collection.js`,
`node backend/tests/test_gqwf_canary_rollout.js`,
`node backend/tests/test_gqwf_execution_workspace.js`,
`node backend/tests/test_gqwf_mission_execution.js` et
`node backend/tests/test_gqwf_organism_snapshot.js`. Les gates généraux du
dépôt restent requis pour toute livraison.
