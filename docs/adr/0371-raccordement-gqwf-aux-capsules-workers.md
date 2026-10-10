# ADR 0371 — Raccorder les capsules workers aux vues GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-10
- **Domaine** : Workspaces, workers, snapshots
- **Décideurs** : Équipe GenOS
- **Lié à** : [ADR 0369](0369-racines-gqwf-et-vues-durables.md)

## Contexte

Le runtime exécute les workers dans des capsules physiques isolées. Le noyau
GQWF v2 possède des racines immuables et des vues privées, mais ne connaissait
pas l'identité d'un worker ni la fin de vie de sa capsule. Une racine GQWF est
une projection de fichiers : elle ne contient pas Git, les dépendances de build
ni l'environnement d'exécution. Elle ne peut donc pas remplacer directement
toutes les capsules physiques.

## Décision

Pour une mission dont `executionPolicy.gqwfV2` vaut `true`, chaque worker
autonome conserve sa capsule physique. Après sa création, GenOS importe la
projection de cette capsule, crée une vue privée et persiste le lien entre
worker, workspace source, racine de base, vue et chemin de capsule. Le lien
exige le registre de possession `agent_capsule_cleanup`.

Avant de programmer le nettoyage de la capsule, GenOS réimporte son état
physique, inscrit les différences dans la vue et persiste une racine candidate.
La capture est idempotente. Une erreur de capture est enregistrée, laisse la
capsule disponible et sera retentée à la prochaine demande de nettoyage ou
réconciliation. Le résultat reste **candidat** : aucun statut de processus ne
vaut preuve de promotion, et la tête GQWF ne bouge pas automatiquement.

## Conséquences

Le mode explicite préserve les parcours historiques et évite de prétendre que
la projection GQWF suffit à exécuter du code. Les blobs sont dédupliqués dans
le workspace source; les capsules restent séparées pendant l'exécution. Le
coût de l'import et de la capture doit être mesuré avant une activation par
défaut. Les chemins refusés, les limites de projection ou les modifications
concurrentes de vue font échouer la capture sans effacer la capsule.

L'alignement avec les dossiers de preuve Trinity, la publication vérifiée des
racines candidates, le GC des blobs et la substitution éventuelle de capsules
par une matérialisation GQWF restent des travaux distincts.

## Alternatives

- Remplacer directement chaque capsule par la projection GQWF : écarté car Git,
  les dépendances et certains fichiers d'exécution n'y figurent pas.
- Capturer sans lier le worker ni vérifier la possession de sa capsule : écarté
  car l'attribution du candidat serait ambiguë.
