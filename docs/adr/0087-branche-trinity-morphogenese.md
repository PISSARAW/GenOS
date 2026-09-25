# ADR 0087 — Branche Trinity dans la Morphogenèse

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Morphogenèse, Trinity, comparaison, preuves, budgets
- **Décideurs** : GenOS
- **Lié à** : ADR 0051, ADR 0086, contrat opérationnel Trinity v1

## Contexte

Le compilateur Morphogenèse sait décrire une topologie de travail et peut lui
adjoindre une branche Rhizome explicitement demandée. Trinity doit pouvoir être
composé de la même manière, sans remplacer la topologie existante ni contourner
son budget ou son protocole de preuve.

## Décision

Lorsque le plan demande explicitement `trinityBranch: true`, le graphe reçoit un
nœud enfant `trinity` à l'état `proposed`. La branche exige un budget positif
`budget.trinityTokens`, conserve exactement les chambres `direct`, `structured`
et `falsification`, et marque leur communication comme scellée jusqu'à la
comparaison. La promotion est vérifiée uniquement.

Sans demande explicite, le graphe reste inchangé. Cette proposition morphologique
ne lance pas les workers Trinity ; leur orchestration reste sous le contrôle du
runtime Trinity, de son allocation budgétaire et de ses gardes d'isolation.

## Conséquences

### Positives

- Trinity peut être représenté comme sous-topologie de la Morphogenèse.
- Le nombre de chambres et leur indépendance restent visibles dans le plan.
- La branche ne peut pas être produite sans allocation dédiée et positive.

### Négatives

- Le planificateur doit fournir explicitement `trinityBranch` et `trinityTokens`.
- Le nœud décrit une proposition ; il ne vaut ni dispatch, ni résultat, ni preuve.

## Alternatives

- Remplacer la topologie racine par Trinity : écarté, car cela détruirait la
  composition avec l'organisation de travail existante.
- Activer Trinity sur le seul signal d'incertitude : différé, car le protocole
  opérationnel exige aussi une décision de budget et des entrées d'engagement.
