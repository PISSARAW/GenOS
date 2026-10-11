# GQWF v2 — Racines de fichiers et vues durables

- **Statut** : Partiel — noyau backend, workers autonomes, promotion Trinity et capture/restauration des fichiers d'organisme disponibles en opt-in.
- **Portée** : projection de fichiers, overlays, merge, matérialisation, tête versionnée.
- **Dernière revue** : 2026-10-11.

Le noyau [GQWF](../../backend/src/services/gqwf/index.js) ajoute une représentation
logique des fichiers sans remplacer les snapshots v1. Il suit l'[ADR 0369](../adr/0369-racines-gqwf-et-vues-durables.md).

| Objet | Stockage | Contrat |
| --- | --- | --- |
| Blob | `.genos/gqwf/blobs/<préfixe>/<sha256>` dans le workspace | Octets relus avec contrôle SHA-256 |
| Racine | `gqwf_roots` | Manifeste déterministe et politique de projection v2 |
| Vue | `gqwf_views` et `gqwf_changes` | Base immuable, overlay privé durable, version attendue |
| Tête | `gqwf_heads` et `gqwf_head_events` | Génération monotone et reçu de vérification |
| Bail | `gqwf_leases` | Dossier matérialisé puis ingéré ou libéré explicitement |

Le service expose `importBase`, `importLegacySnapshot`, `createView`, `readFile`, `listFiles`, `writeFile`,
`deleteFile`, `sealView`, `mergeRoots`, `materializeRoot`, `ingestLease` et
`releaseLease`. `publishCandidate` échoue sans vérificateur injecté par le
runtime. Une écriture ou suppression exige `expectedVersion`; une publication
exige `expectedHash` et `expectedGeneration`.

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

## Workers physiques et vues durables

Une mission peut activer `executionPolicy.gqwfV2: true`. Après création de sa
capsule physique, chaque worker autonome reçoit une vue GQWF privée liée à la
projection initiale de la capsule. Le lien est conservé dans
`gqwf_worker_bindings` et associé à la possession effective de la capsule.
`inspectWorker` permet de consulter ce lien et son statut dans le workspace
autorisé.
À la clôture, y compris pour un worker natif déterministe, GenOS importe la capsule dans le magasin de
blobs du workspace source, inscrit ses différences dans la vue et conserve
une `candidate_hash`. Une capture échouée garde la capsule et son erreur pour
une nouvelle tentative. La racine candidate ne modifie aucune tête publiée.

Les capsules physiques continuent de fournir Git, les dépendances et les outils
d'exécution. La projection GQWF contient les fichiers admis par la politique de
snapshot, pas une image complète de l'environnement. Ce raccordement ne
concerne pas encore les autres points d'entrée workers. La promotion Trinity
décrite plus haut est un parcours distinct. Voir l'[ADR 0371](../adr/0371-raccordement-gqwf-aux-capsules-workers.md).

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

Validation ciblée : `node backend/tests/test_gqwf_fabric.js` et
`node backend/tests/test_gqwf_organism_snapshot.js`. Les gates généraux
du dépôt restent requis pour toute livraison.
