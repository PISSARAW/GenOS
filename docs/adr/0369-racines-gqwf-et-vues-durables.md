# ADR 0369 — Racines de fichiers GQWF et vues durables

- **Statut** : Accepté, portée noyau backend.
- **Date** : 2026-10-10.
- **Domaine** : Workspaces, snapshots, isolation.
- **Décideurs** : Équipe GenOS.
- **Lié à** : [ADR 0327](0327-trinity-comparaison-recherche-et-assemblage.md), [ADR 0367](0367-sections-durables-snapshot-organisme.md).

## Contexte

Le mode `GENOS_VFS_WORKSPACES=1` crée encore une copie physique. Le VFS de simulation
stocke des fichiers en mémoire et le payload de snapshot durable partage un dossier
seulement si le manifeste complet a la même empreinte. Trois agents issus d'une
base commune ne peuvent donc pas disposer d'overlays de fichiers persistants
sans copies complètes. Le bundle d'organisme récent référence un snapshot de
fichiers, des sections SQLite et des checkpoints Rust, mais ne rend pas leurs
mutations globalement atomiques.

## Décision

Ajouter au backend un magasin GQWF v2 par workspace. Chaque blob est adressé par
SHA-256. Une racine immuable contient une politique de projection versionnée et
une liste canonique de fichiers, chemins, tailles, empreintes et modes assainis.
Les identités sont confinées au workspace ; un hash seul ne donne pas accès à
une racine ou à un blob d'un autre workspace.

Un pont importe un snapshot v1 après lecture de son manifeste vérifié, compare
les chemins, empreintes et tailles, puis conserve le lien entre son ID et la
nouvelle racine. Il ne réécrit pas le snapshot historique.

Une vue référence une racine et un overlay durable en SQLite. Les écritures
créent un blob, les suppressions créent une tombstone et toute mutation exige
la version attendue de l'overlay. Un scellage crée une nouvelle racine sans
modifier la base. Le merge à trois états produit une racine candidate ou une
liste de conflits. La matérialisation crée un dossier géré par bail ; son
ingestion produit une autre racine après deux scans cohérents.

La tête porte un numéro de génération monotone. La publication d'un candidat
exige un vérificateur injecté par le runtime, un reçu lié à la racine candidate
et une comparaison de génération et de racine sous transaction SQLite. Sans
vérificateur, la publication échoue. Cette primitive ne contourne pas les
gates de promotion existants : l'intégration du vérificateur et de Trinity
reste un travail distinct avant activation générale.

Le format v2 représente la projection source actuelle : les chemins ignorés,
liens symboliques et répertoires vides ne sont pas capturés. Les noms non
portables et collisions insensibles à la casse sont refusés. Une racine de
fichiers ne prouve ni la présence des dépendances de build ni la cohérence
des autres organes. Les snapshots historiques restent dans leur format et
leur chemin de lecture existants.

## Conséquences

### Positives

- Une modification isolée n'ajoute que son blob et une nouvelle liste de fichiers.
- Les agents peuvent partager une base sans voir leurs écritures non scellées.
- La version d'overlay et la génération de tête rendent les conflits explicites.
- Les racines historiques GQWF restent adressables après une nouvelle tête.

### Négatives et limites

- Les blobs publiés avant l'inscription SQLite peuvent rester orphelins après
  une panne. Aucun GC de blobs n'est activé avant l'inventaire de toutes les
  racines et de tous les baux à protéger.
- Les commandes qui exigent un chemin physique déclenchent une matérialisation.
  Les gains en temps et en espace doivent être mesurés sur le cycle complet.
- La transaction SQLite ne couvre ni les fichiers du magasin, ni l'exécution
  externe, ni les checkpoints Rust. Le format ne constitue pas un snapshot
  atomique de l'organisme ou d'une cohorte de mission.
- Une matérialisation abandonnée reste à réconcilier. Le nettoyage automatique
  n'est pas activé sans preuve que son bail n'est plus utilisé.

## Alternatives

- Faire de Git l'unique magasin : écarté pour les workspaces non Git et les
  projections distinctes de l'arbre Git ; Git reste un adaptateur possible.
- Remplacer immédiatement les snapshots v1 : écarté pour conserver leurs
  références, leurs garanties historiques et les parcours de restauration.
- Publier une tête après un simple booléen fourni par le caller : écarté ;
  seule une frontière de vérification du runtime peut autoriser cette transition.
