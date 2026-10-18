# ADR 0628 — SPI de matérialisation GQWF

- **Statut** : Accepté, étendu par les backends reflink et OverlayFS
- **Date** : 2026-10-18
- **Domaine** : GQWF, workspaces, matérialisation, portabilité
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0369, ADR 0378, ADR 0608, ADR 0616, ADR 0618
- **Étendu par** : ADR 0629, ADR 0631, ADR 0632

## Contexte

GQWF porte déjà les racines immuables, les vues privées, les baux, la capture,
les gates de preuve et la publication atomique. Sa matérialisation physique
reposait toutefois directement sur une copie complète dans le service de bail.
Cette dépendance empêchait d'introduire plus tard un reflink, un overlay monté ou
un autre mécanisme local sans mêler son cycle de vie aux invariants sémantiques.

Un accélérateur physique ne doit devenir ni une seconde autorité, ni une source
de racines différente. Son indisponibilité ne doit pas non plus provoquer un
fallback silencieux après qu'un backend précis a été demandé.

## Décision

GQWF sépare la matérialisation physique derrière un contrat versionné. Un
backend fournit `probe`, `materialize`, `capture`, `release` et `recover`. Sa
sonde déclare notamment sa disponibilité, sa granularité de copie, son besoin
de montage et sa portabilité. La sélection est terminée avant toute création de
dossier ou de bail.

La tranche 8 enregistre pour chaque bail un reçu durable contenant le backend,
la version du contrat, les capacités observées, leur hash et la raison de
sélection. La capture, la libération et la reprise relisent ce reçu. Un backend
inconnu, indisponible ou dont les capacités ont changé est refusé. Les anciens
baux sans reçu sont explicitement rattachés à `portable-copy-v1` lors de leur
reprise, avec la raison `legacy_portable_compatibility`.

Le backend `portable-copy-v1` reproduit le comportement antérieur et reste le
seul backend de production de cette tranche. Les backends injectés servent aux
tests de conformité. Ils doivent produire la même racine candidate à projection
égale et ne peuvent modifier ni les gates de preuve, ni le CAS de tête, ni les
politiques de collecte.

Les ADR 0629 et 0632 ajoutent ensuite `native-reflink-v1` et
`linux-overlayfs-v1`. Le premier dépend des capacités du volume ; le second est
limité à Linux et à une sonde de montage réussie. Une politique `auto` peut se
replier explicitement sur `portable-copy-v1` et inscrit les causes du choix dans
le reçu ; une sélection explicite indisponible continue d'échouer fermée.

Les capacités incluent la plateforme. Un bail physique est local à son hôte :
un changement de plateforme ou de capacités pendant son cycle de vie échoue de
façon fermée au lieu d'être interprété comme une reprise portable.

## Conséquences

### Positives

- Les optimisations futures restent des mécanismes remplaçables sous l'autorité
  sémantique de GQWF.
- Le choix physique et ses capacités sont auditables par bail.
- L'indisponibilité explicite est détectée avant toute mutation physique.
- Le backend portable conserve le comportement et la compatibilité existants.

### Négatives

- Aucun gain de performance n'est livré ni revendiqué par cette tranche.
- Les reçus et leurs contrôles ajoutent une écriture SQLite par bail.
- Une évolution légitime des capacités exige de terminer ou migrer les baux
  actifs avant le déploiement.

## Alternatives

- Ajouter directement OverlayFS ou les reflinks dans le service de bail :
  rejeté, car le mécanisme physique deviendrait une dépendance de l'autorité.
- Faire du backend physique une seconde source de vérité : rejeté, car la
  promotion et la récupération pourraient diverger des racines GQWF.
- Autoriser un fallback silencieux vers la copie portable : rejeté pour une
  sélection explicite ; il masquerait le comportement réellement exécuté.
- Reporter les reçus jusqu'au premier accélérateur : rejeté, car le contrat ne
  serait pas qualifié indépendamment de l'optimisation.
