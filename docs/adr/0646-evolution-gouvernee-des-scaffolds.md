# ADR 0646 — Gouverner l’évolution des logiques et scaffolds

- **Statut** : Accepté, noyau déterministe sans application automatique
- **Date** : 2026-10-20
- **Domaine** : Évolution agentique, constitution, preuve, rollback
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : [ADR 0002](0002-agentdna-innovation-loop.md), [épistémologie et évidence](../01-concepts/epistemologie-et-evidence.md), [évolution gouvernée](../01-concepts/evolution-gouvernee-agent.md)

## Contexte

Une boucle d’auto-amélioration peut confondre trois rôles : produire une nouvelle
logique, choisir la métrique qui la favorise et l’installer. Cette concentration
rend possible la modification des garde-fous, la fuite du corpus d’apprentissage
vers le holdout et l’optimisation d’un score proxy sans bénéfice sur la
responsabilité réelle.

GenOS possédait des gates de promotion et des lignées, mais il manquait un petit
contrat dédié aux changements de logique ou de scaffold qui rende cette séparation
observable avant toute application.

## Décision

Ajouter un noyau `governedEvolution` en trois frontières :

1. une constitution canonique scellée par SHA-256 protège des préfixes de chemin et
   des règles immuables ;
2. le producteur ne crée qu’une hypothèse liée à un parent, un candidat et une
   référence de rollback ;
3. un évaluateur et un propriétaire de mesure distincts vérifient un holdout scellé
   et disjoint, puis un autorisateur encore distinct peut émettre
   `AUTHORIZED_PENDING_APPLY`.

Le gate exige un bénéfice direct mesuré par des reçus de responsabilité. Un gain de
score proxy ou une métrique auto-déclarée ne suffit pas. Toute sortie conserve
`promotionEligible: false` : le noyau ne contient aucun applicateur de code ni chemin
d’auto-promotion.

Une campagne sans hypothèse qualifiée retourne explicitement `NO_CHANGE`. Le ledger
conserve aussi les contrôles, preuves et causes des candidats rejetés. Un rollback
ne peut être enregistré que vers la révision parente et avec un reçu explicite.

## Conséquences

### Positives

- la constitution ne se trouve pas dans l’espace de recherche du producteur ;
- proposition, mesure et autorisation ont des identités séparées ;
- les gains proxy sans transfert à une responsabilité réelle sont rejetés ;
- les échecs et les lignées restent inspectables ;
- l’abstention est un résultat normal et testable.

### Négatives et limites

- le ledger livré est un noyau en mémoire ; sa persistance durable requiert un
  adaptateur transactionnel avant emploi multi-processus ;
- le scellement SHA-256 garantit l’intégrité, pas l’identité du signataire ;
- les runners de holdout et l’application effective restent fournis par l’appelant ;
- aucun benchmark de supériorité face à un autre système n’est revendiqué.

## Alternatives

| Option | Verdict | Motif |
| --- | --- | --- |
| Auto-réécriture et auto-promotion monolithiques | Rejetée | mêmes intérêts pour produire, noter et déployer |
| Réutiliser uniquement le score de fitness existant | Rejetée | un proxy ne prouve pas le transfert à la responsabilité réelle |
| Noyau déterministe séparé des adaptateurs d’exécution | Retenue | testable, fermé par défaut et composable avec les gates existants |
| Bloquer toute évolution | Rejetée | empêche l’apprentissage sans améliorer l’épistémologie |
