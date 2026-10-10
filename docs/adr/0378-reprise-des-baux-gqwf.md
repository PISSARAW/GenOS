# ADR 0378 — Reprise de la libération des baux GQWF

- **Statut** : Accepté pour la tranche SQLite locale
- **Date** : 2026-10-10
- **Domaine** : GQWF, matérialisation, reprise après panne
- **Décideurs** : maintenance GenOS
- **Lié à** : [ADR 0369](0369-racines-gqwf-et-vues-durables.md)

## Contexte

La libération écrivait `released` avant la suppression du dossier. Une panne
entre ces opérations laissait un dossier sur disque. L'appel suivant refusait
le bail, car il exigeait que le dossier existe avant de lire son état. Une
ancienne base peut donc contenir un bail `released` encore matérialisé.

## Décision

Le bail passe de `open` ou `ingested` à `releasing` avant la suppression. La
suppression réussie, y compris si le dossier a déjà disparu, permet de passer
à `released`. Le chemin est revalidé dans la racine gérée et un lien symbolique
à sa place est refusé avant toute suppression. Un nouvel appel à `releaseLease`
reprend un état `releasing` et accepte un état `released` comme succès répété.

`reconcileReleasingLeases` traite au plus 100 baux d'un workspace par appel.
`materializeRoot` réconcilie automatiquement les `releasing` avant une nouvelle
création, puis refuse la création si un `preparing` ou `quarantined` demeure.
La migration SQLite convertit les anciens `released` en `releasing` afin de
vérifier une fois la présence éventuelle de leur dossier. Le traitement est
idempotent : une panne après suppression mais avant la dernière écriture SQL
laisse un bail `releasing` relançable.

La création inscrit désormais un bail `preparing` avec un chemin fondé sur son
UUID avant `mkdir`. Le dossier reçoit immédiatement un marqueur
`.genos-gqwf-lease` contenant cet identifiant ; la projection GQWF ignore ce
fichier. La transition vers `open` n'intervient qu'après l'écriture complète.
Une reprise explicite avec `recoverPreparations: true`, à exécuter après arrêt
des producteurs du workspace, traite aussi les baux `preparing` ; elle n'est
pas lancée automatiquement au redémarrage. Elle efface
un dossier uniquement si son marqueur correspond à la ligne SQL. Un dossier
sans marqueur passe à `quarantined` et demeure sur disque pour examen.
Une collision au `mkdir` reste également en quarantaine sans suppression.
La libération des nouveaux baux revérifie le marqueur avant `fs.rm` et met en
quarantaine un dossier remplacé. Les anciens baux, dont le chemin issu de
`mkdtemp` ne correspond pas à `lease-<id>`, n'ont pas de marqueur : leur ligne
SQL est la preuve historique, car elle était insérée après matérialisation.

## Conséquences et limites

- Une erreur de suppression laisse le bail `releasing` et remonte à l'appelant.
- Plusieurs appels peuvent être nécessaires si plus de 100 baux sont en cours
  de libération ; un appel explicite à `reconcileReleasingLeases` est disponible.
- La reprise des préparations exige l'arrêt des producteurs du workspace ;
  l'appel normal à `materializeRoot` refuse tout nouveau bail tant qu'un état
  `preparing` ou `quarantined` est présent.
- La réconciliation est locale au workspace consulté. Elle ne découvre pas les
  dossiers créés par l'ancien code avant l'insertion du bail. Une panne entre
  `mkdir` et le marqueur laisse un dossier attribuable à une ligne SQL, mais
  non prouvé comme créé par GenOS : il est mis en quarantaine sans suppression.
- Cette décision ne modifie ni les reçus de promotion ni les captures workers.

## Vérification

`node backend/tests/test_gqwf_fabric.js` couvre la migration d'un ancien bail
`released` avec dossier présent, la reprise après réouverture SQLite, la
suppression déjà faite, un échec de suppression suivi d'une reprise, le
confinement du chemin, l'appel répété à `releaseLease` et
`PRAGMA foreign_key_check` avant et après réouverture. Il couvre aussi les
trois points d'arrêt de la préparation, le refus de nouvelle matérialisation
et la conservation des dossiers sans marqueur ou sans bail enregistré. Un
dossier ordinaire substitué à un nouveau bail est conservé en quarantaine.
