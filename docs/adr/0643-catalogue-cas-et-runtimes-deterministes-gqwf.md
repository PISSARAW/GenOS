# ADR 0643 — Adresser le catalogue GQWF et unifier les runtimes opt-in

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Domaine** : GQWF, CAS, SQLite, reprise, runtimes, matérialisation
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0369, ADR 0605, ADR 0608, ADR 0629, ADR 0639

## Contexte

Les blobs GQWF étaient adressés par contenu, mais les manifestes de racine, les
têtes et les baux restaient uniquement dans SQLite. Le hash d'une racine
validait bien son manifeste lorsqu'une ligne existait ; il ne permettait pas de
retrouver cette ligne après perte du catalogue. La réparation authentifiée de
l'ADR 0639 restaurait les blobs depuis une réplique, pas ce plan de contrôle.

En parallèle, `executionPolicy.gqwfV2` excluait encore les workers natifs
déterministes et les runtimes locaux ou in-process. Cette exception conservait
une seconde voie de copie physique alors que le cycle GQWF savait déjà remettre
un chemin matérialisé ordinaire au runtime. Enfin, OverlayFS n'est disponible
que sous Linux, mais `native-reflink-v1` fournit déjà une voie Copy-on-Write sur
tout volume où la sonde Node `COPYFILE_FICLONE_FORCE` réussit, notamment sous
Windows selon le filesystem.

## Décision

### Catalogue adressé par contenu

Introduire `gqwf-catalog-v1`, un snapshot canonique contenant :

- tous les `rootHash` et leurs manifestes validés ;
- toutes les têtes avec leur génération ;
- tous les baux avec racine, chemins, statut et date de création.

Les manifestes sont écrits comme objets CAS sous leur `rootHash`. Le catalogue
complet est écrit dans `.genos/gqwf/metadata/objects/<préfixe>/<sha256>`.
`gqwf_catalog_state` alloue une révision monotone pendant une transaction
SQLite ; après son commit, une ref append-only publie le hash. Les objets sont
immuables, les refs jouent le même rôle de pointeur mutable que les refs Git.
Deux refs différentes à la révision maximale constituent un fork et bloquent la
lecture au lieu d'être départagées implicitement.

Les mutations publiques qui créent ou retirent une racine, déplacent une tête
ou font évoluer un bail déclenchent un checkpoint. Une mutation qui échoue
après avoir persisté un état de reprise, par exemple `releasing`, checkpoint
aussi cet état.

### Reconstruction SQLite

`inspectMetadataRepair` compare le dernier catalogue publié aux caches
`gqwf_roots`, `gqwf_heads` et `gqwf_leases`. Son `planHash` couvre le hash et la
révision du catalogue ainsi que la liste canonique des divergences.
`repairMetadata` exige ce plan inchangé et une autorisation liée, puis restaure
les lignes et émet un reçu `gqwf-metadata-repair-v1`.

Un bail restauré qui n'était pas terminal est forcé à `quarantined`. La présence
d'un ancien statut `open` dans un catalogue ne prouve ni l'existence du dossier,
ni son marqueur de possession, ni l'état d'un montage noyau. Sa reprise reste
une opération distincte et explicite.

### Runtimes opt-in

Supprimer l'exclusion des workers déterministes et des runtimes locaux ou
in-process dans `missionExecution.eligible`. Pour tout orchestrateur opt-in, la
copie physique initiale est différée jusqu'à la préparation de la session GQWF.
Le runtime reçoit ensuite le même `workspaceRoot` matérialisé que les autres
missions. Les chemins déjà gérés par `gqwf-worker` restent exclus pour éviter
une double matérialisation.

Cette décision ne rend pas GQWF global : une mission sans
`executionPolicy.gqwfV2: true` conserve le backend physique et aucune candidate
n'est publiée automatiquement.

## Conséquences

### Positives

- Une ligne `gqwf_roots` ou son manifeste peut être reconstruite sans faire
  confiance à ses anciens octets SQLite.
- Les têtes et les baux possèdent une représentation immuable, chaînée et
  vérifiable hors du fichier SQLite.
- Une perte partielle du manifeste SQLite n'empêche plus la réparation des
  métadonnées GQWF.
- L'opt-in a la même sémantique pour les runtimes supervisés, déterministes,
  locaux et in-process.
- Sous Windows, `auto` sonde le reflink avant de payer une copie portable.

### Négatives et limites

- Les refs append-only ne sont pas des objets CAS et consomment progressivement
  des inodes ; leur rétention devra être bornée par une politique ultérieure.
- La publication de la ref suit le commit SQLite. Un arrêt dans cette fenêtre
  peut laisser la dernière révision seulement dans `gqwf_catalog_state` jusqu'au
  checkpoint suivant ; la dernière ref déjà publiée reste toutefois valide.
- La table globale `workspaces`, les vues, les overlays, les sessions et les
  reçus spécialisés ne sont pas reconstruits par cette opération.
- Un catalogue valide ne restaure aucun dossier physique et ne vaut pas preuve
  de succès d'une mission.
- Le reflink Windows dépend des capacités réellement sondées du volume ; le
  fallback portable reste nécessaire.

## Alternatives

### Sauvegarder seulement le fichier SQLite

Rejeté : une copie améliore la disponibilité, mais ne rend pas les métadonnées
auto-authentifiantes et reproduit potentiellement une corruption logique.

### Scanner tous les blobs pour deviner les métadonnées

Rejeté : les octets utilisateur peuvent ressembler à un document interne et
aucune règle sûre ne permet d'élire le dernier état d'une tête ou d'un bail.

### Réouvrir les baux restaurés

Rejeté : SQLite ou le CAS ne prouvent pas l'état du filesystem ni du noyau.

### Conserver les exceptions déterministes et in-process

Rejeté : ces runtimes consomment déjà un chemin de workspace ordinaire et ne
justifient pas une sémantique différente lorsque l'opt-in est explicite.

## Validation

- `node backend/tests/test_gqwf_metadata_repair.js` couvre les objets de
  manifeste, la reconstruction de racines/têtes/baux, le plan périmé,
  l'autorisation absente et l'altération du catalogue CAS.
- `node backend/tests/test_gqwf_mission_execution.js` couvre les missions
  supervisées, déterministes et in-process sur le même cycle de bail.
- Les suites GQWF existantes vérifient que la reprise interrompue des baux, les
  promotions et les matérialiseurs conservent leurs contrats.
