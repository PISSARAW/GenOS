# GQWF v2 — Racines de fichiers et vues durables

- **Statut** : Partiel — noyau backend et raccordement explicite des workers autonomes implémentés.
- **Portée** : projection de fichiers, overlays, merge, matérialisation, tête versionnée.
- **Dernière revue** : 2026-10-10.

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
concerne pas encore les autres points d'entrée workers ni la qualification
Trinity. Voir l'[ADR 0371](../adr/0371-raccordement-gqwf-aux-capsules-workers.md).

La projection est limitée par les quotas de snapshots existants. Elle exclut
les mêmes chemins que les snapshots de workspace v1 et refuse les symlinks,
les hardlinks, les fichiers spéciaux et les noms non portables. Les modes
d'exécution sont assainis. Une racine n'est donc pas une image de build complète :
les dépendances et l'environnement d'exécution demandent une provenance distincte.

La capture et la restauration d'organisme continuent d'utiliser leur contrat
actuel. Le pointeur de checkpoint Rust et les missions partagées ne sont pas
pilotés par GQWF v2. Aucun gain de performance n'est revendiqué sans benchmark
sur import, fork, lecture, matérialisation, test et promotion.

Le pont v1 relit le manifeste historique avec son vérificateur existant et
conserve un lien `snapshot_id → root_hash`. Il n'active pas automatiquement
GQWF pour les captures ou restaurations d'organisme.

Validation ciblée : `node backend/tests/test_gqwf_fabric.js`. Les gates généraux
du dépôt restent requis pour toute livraison.
