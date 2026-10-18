# ADR 0614 — Collecter explicitement les racines et blobs GQWF

- **Statut** : Accepté, activation explicite
- **Date** : 2026-10-18
- **Domaine** : GQWF, stockage, récupération, exploitation

## Contexte

Les imports, scellements et captures GQWF produisent des racines immuables et
des blobs adressés par contenu. Les tranches précédentes ne supprimaient rien :
une candidate abandonnée ou un import interrompu pouvait donc laisser des
objets inaccessibles. Une suppression fondée uniquement sur la tête courante
serait toutefois dangereuse, car vues, baux, sessions, workers et reçus
historiques conservent aussi des références durables.

Une collecte peut en outre croiser une écriture qui a déjà produit ses blobs,
mais n'a pas encore inscrit sa racine ou son overlay.

## Décision

GQWF fournit deux opérations distinctes :

- `inspectGarbage` calcule un inventaire sans mutation ;
- `collectGarbage` exige le hash SHA-256 exact d'un inventaire précédent,
  le recalcule sous transaction SQLite `IMMEDIATE`, puis refuse toute dérive.

Le marquage protège les racines référencées par les têtes, vues, baux,
sessions d'exécution, événements de tête, liens de snapshots historiques,
bindings workers et reçus de promotion. Les blobs d'overlay non supprimés sont
marqués directement. Les manifests de toutes les racines marquées étendent
ensuite cet ensemble aux blobs qu'ils contiennent.

Le balayage ne considère que les fichiers réguliers privés dont le chemin est
exactement `.genos/gqwf/blobs/<préfixe>/<sha256>`. Une entrée inattendue, un
lien, un hardlink ou un contenu dont le hash ne correspond pas à son nom est
conservé et bloque l'application. Après vérification de l'inventaire, les
racines inaccessibles sont supprimées avant leurs blobs, dans la même section
transactionnelle. Un reçu durable `gqwf_gc_runs` est inscrit avant le commit.

Pour fermer la course avec les producteurs, l'inscription d'une racine relit
désormais tous ses blobs sous transaction. De même, une mutation d'overlay
relit son blob sous transaction. Si la collecte gagne, l'écriture échoue sans
créer de référence cassée ; si l'écriture gagne, le nouveau mark la protège.

## Conséquences

- Aucune collecte automatique n'est déclenchée par une libération de bail ou
  par la réussite d'un worker.
- Un reçu ou un bail historique conserve sa racine tant que sa ligne existe ;
  cette rétention volontaire privilégie la preuve à la récupération d'espace.
- Un aperçu périmé ne peut pas être appliqué silencieusement.
- Les fichiers étrangers ou ambigus ne sont jamais assimilés à des blobs
  supprimables.
- La collecte peut laisser des répertoires de préfixe vides ; ils ne portent
  aucune donnée et ne sont pas supprimés.

## Validation

`node backend/tests/test_gqwf_garbage_collection.js`

`node backend/tests/test_gqwf_fabric.js`

`node backend/tests/test_gqwf_worker_execution.js`
