# Biomimétisme & Bet-Hedging : Diversification Stratégique sous Incertitude

> Domaine : biologie évolutive (stratégies de paris) — Statut : proposition de recherche

## 1. Fondement biologique
Les bactéries en environnement imprévisible produisent délibérément des descendants **phénotypiquement hétérogènes** (certaines dormantes, d'autres actives) bien que génétiquement identiques. Le bet-hedging maximise la fitness **géométrique** à long terme, pas la moyenne : il accepte une espérance plus basse pour réduire la variance et survivre aux catastrophes. Ce n'est pas de l'exploration optimiste — c'est de l'assurance.

## 2. Formalisation GenOS
```
BetHedging(parent P, budget B) :
  Au lieu de N forks identiques vers l'hypothèse la plus probable :
    allocation = argmax E[log(fitness)] (critère géométrique), avec fraction φ fixe allouée
    aux phénotypes « assurance » (dormants, généralistes, conservateurs)
  Paramètres : φ croît avec l'incertitude estimée de l'environnement (mesurée par entropie des événements)
Sortie : au moins un descendant viable dans chaque scénario plausibles du futur proche
```

## 3. Mapping primitives existantes
- `genos-runtime/src/branch_evolution/` — mécanique de forks multiples.
- `genos-eval/src/pareto.rs` — le critère géométrique complète le front Pareto arithmétique.
- Cryptobiose — le phénotype « dormant » est déjà réalisable.
- Seuils d'entropie (`evolution_set_entropy_threshold`) — estimateur d'incertitude.

## 4. Cas d'usage
- Environnement réglementaire incertain : émettre parallèlement des agents conformes aux deux interprétations possibles.
- Déploiement sur marché inconnu : 70 % vers la stratégie dominante, 30 % répartis en assurances.

## 5. Apports attendus
- Survivance garantie aux chocs (minimise le risque de ruine de lignée).
- Fondement formel pour dimensionner les forks (au lieu de heuristiques ad hoc).
- Complète la sélection naturelle existante : celle-ci optimise la moyenne, le bet-hedging protège la queue gauche.

## 6. Points d'intégration
Module `genos-eval/src/bet_hedging.rs`, paramètre φ exposé dans les politiques de branchement.
