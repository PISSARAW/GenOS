# ADR 0753 — Budget parent du worker direct

## Contexte

Le dispatch direct d'un worker local ne créait pas le run parent nécessaire au scope budgétaire partagé. Le contrôle des réservations refusait donc l'appel modèle avant l'inférence.

## Décision

Pour un worker local non déterministe sans scope transmis, le pont exige des plafonds explicites positifs en tokens et en dollars, crée un run parent lié au contrat et persiste son scope par `bindParent`. Le scope est transmis au worker et reste soumis aux vérifications de réservation existantes. Un scope transmis est conservé et vérifié par le runtime. Les méthodes natives ne nécessitent pas de scope modèle.

## Conséquences

Un appel direct local doit fournir `execution_budget.tokens` et `execution_budget.costUsd`. `workerTokenLimit` permet de fixer un plafond enfant inférieur au budget parent afin de réserver de la capacité pour une reprise ; il ne peut dépasser le plafond parent. Le run parent est une autorité budgétaire, pas une preuve de réussite de la mission. Les plafonds ne désactivent aucun gate de preuve ou de promotion.

Le run budgétaire passe à `running` après liaison du scope. Un échec ou blocage terminal du worker ferme le run avec le même état ; lorsque le worker termine, le run budgétaire est clos `cancelled` avec une raison explicite, sans déclarer une décision parent réussie. Une attente non terminale ne ferme pas le scope.
