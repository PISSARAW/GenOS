# ADR 0262 — Proposition de mutation et recherche de lignées candidates

- **Statut** : Accepté
- **Date** : 2026-10-01
- **Domaine** : GVX, Self-Twin, AgentGit, expérimentation
- **Décideurs** : Mainteneurs GenOS
- **Lié à** : ADR 0040, ADR 0248, ADR 0257, ADR 0259

## Contexte

Les lacunes d'apprentissage et erreurs du Self-Twin devaient motiver des transformations
testables, suivies de descendants expérimentaux isolés. Le proposant ne doit pas pouvoir
appliquer lui-même une modification active.

## Décision

`gvxMutationProposer.propose` exige un objectif et une prédiction d'impact Self-Twin,
conserve la référence et les effets dans `causalContext`, puis soumet une proposition via
le validateur GVX existant. La proposition reste dans le ledger et ne contient aucun
patch à appliquer.

`gvxLineageSearch.search` exige des adaptateurs d'hôte pour créer une branche candidate
et l'évaluer sous profil de vérification et budgets bornés. Il refuse les branches
annoncées comme production, limite la recherche à huit candidats, détecte les dépassements
de budget observés et journalise les résultats. Le statut produit n'ouvre jamais à lui
seul la promotion; un gate indépendant reste requis.

## Conséquences

- Les hypothèses de changement gardent leur motivation causale Self-Twin.
- Les branches restent dépendantes de l'implémentation de l'adaptateur AgentGit de l'hôte.
- Les campagnes et vérificateurs indépendants doivent être fournis par l'appelant; cette
  tranche ne constitue pas une expérience empirique.

## Alternatives

- Appliquer les patches depuis le proposant : rejeté, car proposer une transformation ne
  confère pas l'autorité de modifier le runtime.
- Promouvoir automatiquement le meilleur outcome : rejeté, car le score et le succès de
  transport ne satisfont pas les gates GVX.
