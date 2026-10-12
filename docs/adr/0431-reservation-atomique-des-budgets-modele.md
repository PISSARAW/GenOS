# ADR 0431 — Réservation atomique des budgets de modèle

- **Statut** : accepté pour la route de modèle Node
- **Date** : 2026-10-11
- **Domaine** : budget de mission, appels concurrents et reprise
- **Complète** : [ADR 0383](0383-economie-tokens-conditionnee-aux-preuves.md), [ADR 0393](0393-budget-delegue-sous-orchestrateur-natif.md)

## Contexte

La route de modèle comparait chaque devis à `ctx.spent`. En revue parallèle,
plusieurs tentatives pouvaient lire la même valeur avant leur appel fournisseur,
puis toutes partir alors que leur somme dépassait le plafond. Les chemins
fallback et enfant pouvaient également porter des contextes différents.

## Décision

Avant chaque appel, la route inscrit une réservation dans
`model_budget_reservations` sous `BEGIN IMMEDIATE`. Une portée est identifiée
par le tenant et `budgetReservationId` quand le parent le fournit, sinon par
le tenant et l'identifiant d'action de la route. Le plafond USD `maxCostUsd` et le plafond total optionnel
`budgetMaxTokens` doivent rester identiques dans cette portée. Les devis
additionnés comprennent les réservations actives, les charges de montant inconnu
et les coûts déjà réglés. L'identifiant de tentative rend l'inscription et son
règlement idempotents.

Une tentative sans appel fournisseur libère sa réservation. Une tentative avec
reçu de tokens et prix connu règle la consommation réelle. Une tentative lancée
sans reçu fiable conserve sa capacité en état `uncertain`, y compris après un
timeout : la capacité ne peut pas être réallouée sur une hypothèse de coût nul.
Un dépassement réel du plafond est enregistré et la sortie est refusée.

Le devis d'entrée utilise le tokenizer estimatif disponible et `maxTokens`
borne la sortie demandée. La réservation prévient les courses entre demandes ;
elle ne garantit pas qu'un fournisseur respectera le plafond de sortie ou
renverra un reçu. Une charge réelle supérieure au devis est imputée au scope.
Une route distante sans prix enregistré est refusée sous plafond USD.
Les appels sans base persistante ou sans plafond explicite restent possibles
pour compatibilité, sans garantie de limite de mission.

`resources.maxTokens = 0` d'un sous-orchestrateur natif reste son propre plafond
de génération. La capacité de ses enfants demeure séparée dans
`resources.maxDelegatedTokens`, conformément à l'ADR 0393. Un enfant qui appelle
le routeur peut partager le plafond du parent en transmettant
`budgetReservationId`, `maxCostUsd` et `budgetMaxTokens`.

## Conséquences et limites

Une réponse fournisseur tardive après le timeout peut porter un coût réel qui
n'est pas encore réconcilié. L'état `uncertain` protège le budget réservé, mais
un opérateur ou une intégration de reçus tardifs devra le régler explicitement.
Les autres chemins de dépense que la route de modèle Node ne sont pas couverts
par cette table. Le suivi de mission global doit les intégrer séparément.

## Vérification

`node backend/tests/test_model_budget_reservations.js` exerce l'admission
concurrente, le budget zéro, la libération avant appel, l'échec sans reçu, le
fallback facturé, le plafond de tokens et l'idempotence sur SQLite réel.
`node backend/tests/test_model_attempt_accounting.js` vérifie que le journal
des tentatives et le registre d'usage restent cohérents.
