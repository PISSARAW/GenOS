# ADR 0612 — Promouvoir explicitement les candidates workers GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-18
- **Domaine** : GQWF, workers, preuves, promotion

## Contexte

La tranche 3 capture les fichiers d'un worker réussi sous forme de racine
candidate, puis libère son bail. Cette capture prouve l'identité des octets,
mais ni leur qualité ni leur aptitude à remplacer une tête publiée. Le statut
du processus ou le score déclaré par un worker ne constitue pas une preuve de
promotion.

La primitive générale `publishCandidate` exige déjà un vérificateur et un CAS
de racine et de génération. Il manquait toutefois le lien durable avec le
worker, sa vue et la preuve qui a motivé la sélection.

## Décision

GQWF expose l'inventaire des candidates capturées pour un ensemble explicite de
workers. Cet inventaire ne classe, ne sélectionne et ne publie rien.

La promotion d'une candidate choisie exige :

- un binding worker terminé avec une candidate capturée ;
- une racine de base identique à la tête attendue ;
- un identifiant de preuve durable non vide ;
- un vérificateur externe dont le verdict lie le worker, la vue, le workspace,
  la base, la candidate, la tête, la génération et cet identifiant de preuve ;
- le CAS existant sur la racine et la génération de tête.

Le déplacement de tête, son événement et le reçu
`gqwf_worker_promotions` sont inscrits dans la même transaction SQLite. Un
échec du reçu annule donc la publication. Le rejeu du même reçu est idempotent.
Une tête devenue obsolète est refusée ; aucune fusion implicite n'est tentée.

## Conséquences

- Une réussite d'exécution reste distincte d'une décision de publication.
- Le comparateur amont garde la responsabilité de choisir la candidate et de
  produire une preuve vérifiable.
- Les candidates perdantes restent inspectables par leur racine durable.
- Les conflits avec une tête avancée doivent passer par un merge explicite et
  une nouvelle vérification.

## Validation

`node backend/tests/test_gqwf_worker_promotion.js`

`node backend/tests/test_gqwf_fabric.js`

`node backend/tests/test_gqwf_trinity_promotion.js`
