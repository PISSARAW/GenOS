# ADR 0447 — Portée de budget modèle commune au parent et aux workers

- **Statut** : accepté pour le worker local en processus
- **Date** : 2026-10-12
- **Domaine** : budget de mission et délégation
- **Complète** : [ADR 0431](0431-reservation-atomique-des-budgets-modele.md)

## Contexte

Le plan distribuait un nombre de tokens et une part du coût à chaque worker.
Ces plafonds locaux ne suffisaient pas à empêcher plusieurs appels de modèle
concurrents, ni les appels du parent, de dépasser ensemble le budget du run.
Le routeur savait déjà réserver atomiquement un plafond commun, mais la mission
autonome ne lui transmettait pas cette portée.

## Décision

Après création du run du parent, si la mission a déclaré explicitement ses
plafonds USD et tokens, le contrôle établit une portée `execution-run:<runId>`
avec ces plafonds normalisés et le tenant du workspace. La mission de chaque
worker créé par la flotte hérite de cette portée. Le contrôle enregistre son
autorité dans `mission_model_budget_scopes` ; les appels vérifient que la copie
de la mission correspond au run parent enregistré. Les appels du worker local en
processus, ainsi que ceux du parent
qui empruntent ce même chemin, la passent au routeur avec une base persistante.
Le plafond USD propre à chaque worker reste appliqué à l'appel ; un champ
séparé donne au registre de réservations le plafond commun du parent.

Une mission enfant sans portée parent, sans coût propre valide ou sans base
persistante échoue avant tout appel fournisseur sur ce chemin. Le registre
additionne les réservations actives et les dépenses réglées sous une identité
commune, y compris entre workers concurrents.

## Limites

Une mission historique sans plafonds explicites n'obtient pas de portée ; son
worker local en processus échoue fermé à l'appel modèle. Le runtime local lancé
en sous-processus, les appels `caller_mcp`, les workers
natifs et les autres consommateurs de modèles n'utilisent pas encore cette
portée. L'enveloppe de budget qu'ils reçoivent ne constitue donc pas une preuve
d'admission atomique commune. Cette décision ne garantit pas qu'un fournisseur
respecte le devis ; un dépassement réel reste enregistré selon l'ADR 0431.

## Vérification

`node backend/tests/test_mission_model_budget_scope.js` utilise SQLite réel.
Après un appel parent, deux enfants concurrents partagent le même identifiant.
Un seul atteint le fournisseur ; l'autre est refusé avant appel, d'abord par le
plafond USD puis dans un second cas par le plafond de tokens. Le test vérifie
aussi l'échec fermé quand la portée ou la base manque.
