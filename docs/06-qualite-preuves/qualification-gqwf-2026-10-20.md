# Qualification ciblée GQWF — 20 octobre 2026

- **Statut** : campagne locale exécutée ; 17 suites GQWF réussies hors sandbox restrictive, porte globale arrêtée par la qualification Trinity.
- **Portée** : fabrique, exécution paresseuse, matérialisation, missions, workers, collecte, intégrité, réplication, réparation et catalogue CAS.
- **Dernière revue** : 2026-10-20.

Ce document enregistre une exécution réelle et ses limites. Il ne transforme pas
une suite locale en certification de production, en benchmark de performance ou
en preuve de portabilité universelle.

## 1. Question de qualification

La campagne cherche à falsifier les affirmations suivantes :

1. une vue privée peut être modifiée et scellée sans muter sa base ;
2. une matérialisation conserve un backend lié au bail jusqu'à sa capture et sa libération ;
3. les parcours mission et worker peuvent produire une candidate sans la publier implicitement ;
4. collecte, réplication et réparation refusent un état qui diffère du plan observé ;
5. le catalogue CAS peut reconstruire son périmètre SQLite et republier une ref perdue ;
6. les matérialiseurs non disponibles ne sont pas présentés comme réellement exercés.

## 2. Environnement observé

| Élément | Valeur |
| --- | --- |
| Date | 2026-10-20 |
| Révision de départ | `b2422f22d4bd434e058780b2d176bd4eea6ec810` |
| Révision GQWF revalidée | `c4ce881321bd9b37e9f406705440c3cc82d5b0b0` (`[FEAT] Réconcilier et borner le catalogue GQWF`) |
| Copie de travail | modifiée ; documentation et développements concurrents non commités présents |
| Plateforme | Windows, exécutions sous sandbox Codex puis hors sandbox restrictive pour les tests de filesystem et HTTP locaux |
| Node.js | `v24.18.0` |
| npm | `11.16.0` |
| Rust | `rustc 1.97.1` |

La révision seule ne suffit donc pas à reproduire la campagne : les tests ont
été exécutés sur le contenu courant de la copie de travail. Le présent rapport
doit être revalidé après stabilisation du commit cible.

Deux campagnes sont distinguées dans ce rapport : la campagne fonctionnelle
directe des 17 suites, puis la revalidation de la tranche catalogue sur
`c4ce8813`. Cette séparation évite d'attribuer au commit seul les résultats
obtenus avec d'autres modifications présentes dans la copie de travail.

## 3. Protocole

Chaque fichier a été lancé directement avec Node depuis la racine du dépôt :

```powershell
node backend/tests/<suite>.js
```

Les 17 suites ont été exécutées séquentiellement afin de réduire les
interférences de fichiers temporaires. La suite snapshot, bloquée deux fois par
le filesystem temporaire de la sandbox, a ensuite réussi pendant la relance
globale autorisée hors de cette restriction.

## 4. Résultats

| Suite | Verdict observé | Ce que le résultat couvre |
| --- | --- | --- |
| `test_gqwf_fabric.js` | PASS | imports, vues, overlays, scellement, merge et têtes |
| `test_gqwf_execution_workspace.js` | PASS | ouverture virtuelle, matérialisation, ingestion et libération |
| `test_gqwf_materialization_contract.js` | PASS | SPI, sélection, reçu et conformité des backends |
| `test_gqwf_reflink_materializer.js` | PASS avec `reflink_probe_enosys` | indisponibilité détectée et contrat de fallback ; pas un reflink Windows exercé |
| `test_gqwf_overlayfs_materializer.js` | PASS avec `overlayfs_platform_win32` | refus/skip de plateforme ; aucun montage OverlayFS exercé |
| `test_gqwf_mount_ready_lease_layout.js` | PASS | conteneur marqué et sous-chemin `root` prêt au montage |
| `test_gqwf_mission_materializer_policy.js` | PASS | validation de la politique mission et refus des combinaisons invalides |
| `test_gqwf_canary_rollout.js` | PASS | affectation bornée, durabilité, transitions et coupe-circuit |
| `test_gqwf_mission_execution.js` | PASS | mission supervisée, candidate et cycle du bail |
| `test_gqwf_worker_execution.js` | PASS | cycle COW logique d'un worker et capture de candidate |
| `test_gqwf_worker_promotion.js` | PASS | promotion worker sous preuve liée |
| `test_gqwf_garbage_collection.js` | PASS | aperçu, refus sur dérive, collecte et scrub |
| `test_gqwf_replication.js` | PASS | autorisation liée, déduplication et reprise |
| `test_gqwf_repair.js` | PASS | réparation authentifiée, quarantaine et contrôle final |
| `test_gqwf_metadata_repair.js` | PASS | reconstruction racines/têtes/baux depuis le catalogue CAS |
| `test_gqwf_catalog_maintenance.js` | PASS | republication post-crash, rétention 64 refs et refus des corruptions/forks |
| `test_gqwf_organism_snapshot.js` | PASS hors sandbox restrictive | référence de racine dans le snapshot d'organisme et frontière de restauration |

### Écart environnemental observé sur l'intégration snapshot

Les deux premières tentatives sous sandbox ont échoué avec `EPERM` pendant :

```text
rename .genos/workspace-snapshots/.snapshot-<id>-<tmp>
    -> .genos/workspace-snapshots/<hash>
```

La pile s'arrêtait dans `snapshotPublishRetry.js` et
`workspaceSnapshotPayload.js`, avant la partie GQWF du scénario. La même suite
a ensuite passé hors sandbox restrictive dans `npm test`. L'observation qualifie
le scénario fonctionnel sur cette machine, mais conserve un problème de
compatibilité avec le filesystem temporaire isolé.

### Porte globale Node

`npm test`, relancé hors sandbox afin d'autoriser les connexions HTTP locales,
a passé le socle backend (57 contrôles) puis les tests GQWF jusqu'à la
qualification Trinity. Il s'est arrêté dans
`test_gqwf_trinity_mission_qualification.js` : le contrat commun de clôture a
refusé la barrière avec `required_member_evidence_invalid`,
`required_workers_incomplete`, `independent_oracle_missing` et
`required_evidence_missing`.

Ce refus ne remet pas en cause les 17 suites ciblées, mais bloque toute
affirmation de qualification Trinity GQWF de bout en bout sur la copie de
travail courante.

### Revalidation de la tranche catalogue

Après le commit `c4ce8813`, les observations suivantes ont été obtenues :

| Commande ou porte | Verdict | Interprétation |
| --- | --- | --- |
| `node backend/tests/test_gqwf_catalog_maintenance.js` | PASS | republication, chaîne, fork/corruption et rétention à 64 refs |
| `node backend/tests/test_gqwf_metadata_repair.js` | PASS | reconstruction du périmètre catalogué après la maintenance |
| `node backend/tests/test_gqwf_fabric.js` | PASS | invariants de base non régressés |
| `python scripts/ci/check_code_quality.py` | PASS | aucune nouvelle dette détectée dans cette tranche |
| `cargo test --workspace` | PASS hors sandbox restrictive | workspace Rust non régressé par la tranche |
| `npm test` | FAIL après les suites GQWF | arrêt dans la qualification Trinity commune, pas dans la maintenance du catalogue |

La porte Node globale est donc **rouge** sur la copie de travail observée. Le
fait que l'échec arrive après les suites GQWF ne permet pas d'annoncer la porte
globale verte ; il permet seulement de circonscrire le dernier échec observé.

## 5. Contre-épreuves couvertes

Les suites vertes exercent notamment :

- conflits de version d'overlay et de génération de tête ;
- vérificateur de promotion absent ou verdict mal lié ;
- backend demandé indisponible ;
- chemin de bail ou marqueur de propriété invalide ;
- reprise des états `preparing` et `releasing` ;
- inventaire de collecte changé entre aperçu et application ;
- corruption, taille ou identité de blob incohérente ;
- réplication entre scopes incompatibles ;
- réparation sans reçu de réplication valide ;
- plan de réparation ou de reconstruction périmé ;
- ref de catalogue perdue après staging ;
- fork de révision et objet de catalogue corrompu ;
- limitation de la fenêtre publiée à 64 refs.

## 6. Affirmations autorisées

Dans le périmètre de ces fixtures locales :

- le modèle racine/vue/bail et ses contrôles de concurrence sont exécutables ;
- les missions et workers testés produisent des candidates sans promotion automatique ;
- les opérations destructives testées sont liées à un aperçu stable ;
- la réplication et la réparation testées conservent l'identité CAS ;
- les racines, têtes et baux peuvent être reconstruits depuis un catalogue CAS valide ;
- la maintenance sait fermer la fenêtre de crash entre staging et publication.

## 7. Non-claims et lacunes

Cette campagne ne prouve pas :

- le remplacement général des snapshots v1 ;
- la restauration complète de SQLite : vues, overlays, sessions, rollouts et reçus restent hors catalogue ;
- l'exécution réelle d'OverlayFS ou du reflink natif sur cette machine ;
- les performances, la scalabilité, la résistance à une coupure matérielle ou à un disque plein ;
- la sûreté sous writers externes non coordonnés ;
- une promotion Trinity de bout en bout avec trois workers réels ;
- une certification multi-OS ou production.

### Couverture des avantages revendiqués

| Propriété | Preuve dans cette campagne | Verdict |
| --- | --- | --- |
| COW logique racine/vue | fabric, execution workspace, worker execution | couvert localement |
| COW physique reflink | sonde `ENOSYS` | non exercé |
| lower/upper OverlayFS | refus `win32` | non exercé |
| isolation façon worktree sans dépendance Git | missions/workers et baux privés | couvert sur fixtures |
| identité immuable façon store Nix | hashes de blobs/racines et refus de corruption | couvert pour les fichiers, pas pour une fermeture de dépendances |
| scrub/réparation inspirés ZFS | suites scrub, réplication, réparation | couvert au niveau applicatif, pas bloc/filesystem |
| reprise de catalogue après crash | maintenance et metadata repair | couvert par injection de fenêtre de crash, pas coupure matérielle |

La table décrit une couverture de tests, pas une équivalence fonctionnelle avec
Btrfs/ZFS, OverlayFS, Git ou Nix.

## 8. Critères avant promotion de maturité

Avant de qualifier GQWF comme défaut global :

1. rejouer la campagne sur un commit propre et scellé ;
2. rendre `test_gqwf_organism_snapshot.js` compatible avec le filesystem temporaire sandboxé ;
3. exercer OverlayFS sur Linux et reflink sur un filesystem compatible ;
4. mesurer copie, COW, capture, GC et pression disque sur des workspaces réalistes ;
5. tester les crashs aux frontières SQLite/ref/CAS sur processus réellement interrompus ;
6. documenter et implémenter, ou exclure explicitement, la reconstruction des projections restantes ;
7. réaligner la fixture Trinity sur le contrat commun de clôture, puis faire passer la porte Node globale ;
8. exécuter les portes globales du dépôt sur un environnement sans restrictions de filesystem.

## 9. Reproduction

```powershell
$tests = @(
  'test_gqwf_fabric.js',
  'test_gqwf_execution_workspace.js',
  'test_gqwf_materialization_contract.js',
  'test_gqwf_reflink_materializer.js',
  'test_gqwf_overlayfs_materializer.js',
  'test_gqwf_mount_ready_lease_layout.js',
  'test_gqwf_mission_materializer_policy.js',
  'test_gqwf_canary_rollout.js',
  'test_gqwf_mission_execution.js',
  'test_gqwf_worker_execution.js',
  'test_gqwf_worker_promotion.js',
  'test_gqwf_garbage_collection.js',
  'test_gqwf_replication.js',
  'test_gqwf_repair.js',
  'test_gqwf_metadata_repair.js',
  'test_gqwf_catalog_maintenance.js',
  'test_gqwf_organism_snapshot.js'
)

$tests | ForEach-Object { node (Join-Path 'backend/tests' $_) }
```

### Format minimal d'un nouveau relevé

Toute nouvelle campagne doit conserver :

1. le SHA du commit et l'état propre ou sale de la copie de travail ;
2. OS, runtime, filesystem et privilèges de montage ;
3. la liste exacte des commandes et leurs codes de sortie ;
4. les motifs de sondes pour les backends non disponibles ;
5. les hashes de reçus/inventaires utiles, sans exposer les contenus ;
6. le premier échec de chaque porte globale ;
7. les non-claims qui restent ouverts.

Une relance sur une copie de travail différente doit créer une nouvelle section
datée au lieu de réécrire rétroactivement ce relevé.

Voir le [concept](../01-concepts/gqwf.md), la
[référence runtime](../03-reference/runtime-gqwf.md), le
[raccord d'orchestration](../02-orchestration/gqwf-v2.md) et le
[runbook](../04-exploitation/gqwf.md).
