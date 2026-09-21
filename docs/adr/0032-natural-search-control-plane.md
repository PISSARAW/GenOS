---
title: Natural Search Control Plane
date: 2026-09-21
status: accepted
authors: Bruney
decision-id: 0032
---

# ADR 0032 : Natural Search Control Plane

## Contexte

GenOS accumule des mécanismes biomimétiques homéostatiques, immunitaires, évolutionnaires, de foraging, de plasticité, etc. Ces mécanismes sont encore principalement des îlots.

Le problème n'est pas l'absence de métaphores biologiques mais l'absence de **capacité à choisir quel processus de recherche activer** face à une situation donnée.

Deux écueils évités :
- une collection de recettes « abeilles pour X, loups pour Y » (biomimétisme décoratif) ;
- un système qui bouge beaucool mais ne progresse pas (diversité comportementale ≠ progrès causal).

La question architecturale est donc : **comment unifier les mécanismes existants sous un plan de contrôle qui sélectionne un processus de recherche plutôt qu'une stratégie de résolution ?**

## Décision

Implémenter un **Natural Search Control Plane** en cinq phases incrémentales au-dessus des mécanismes existants :

1. **Causal Progress Sensor** — mesure du progrès causal au-delà de l'entropie comportementale ;
2. **Entropy × Progression Classifier** — carte 2D (entropie, progrès) produisant 5 états invariants ;
3. **Hypothesis Ledger** — registre d'hypothèses avec confiance bayésienne et détection de lock-in ;
4. **Search Pressure Model** — pression dynamique recalculée par inertie (pas d'addition cumulative) ;
5. **Natural Search Controller** — sélection du processus de recherche (CONTINUE, FORAGE, PLASTICITÉ, CLONAL_AFFINITY_SEARCH, REPLAY_CAUSAL, STRESS_HYPERMUTATION, SPECIATION).

## Principes

- **Nature est un ensemble de processus de recherche, pas une base de données de solutions.**
- Le contrôleur ne résout rien : il sélectionne **comment chercher**.
- La confiance des hypothèses est bayésienne avec prior (α=1, β=1) : une preuve infinitésime ne suffit pas.
- L'incertitude suit l'entropie normalisée de la croyance, pas une incrémentation arbitraire.
- La pression est recalculée à partir de l'état courant avec inertie (pas d'accumulation).
- Le searchYield normalise chaque ressource par son budget (pas d'addition tokens+secondes+dollars).

## Alternatives

### 1. Conserver l'approche actuelle (Swarm Sentinel seul)

Avantage : simplicité.
Inconvénient : pas de distinction entre activité et progrès causal ; pas de gestion explicite des hypothèses.

### 2. Construire un unique service `naturalSearchService.js`

Avantage : un seul fichier.
Inconvient : complexité cyclomatique excessive ; rejeté par la quality gate (>400 lignes, >10 complexité).

### 3. Approche neuronale (RL, apprentissage par renforcement)

Avantage : théoriquement optimal.
Incompréhensible, non déterministe, incompatible avec l'exigence de preuve GenOS.

## Conséquences

### Positives

- Séparation claire des responsabilités (un service par phase) ;
- Tests indépendants par phase ;
- Compatible avec la quality gate (complexité ≤ 10, ≤ 3 paramètres, ≤ 400 lignes) ;
- Intégration possible dans `agentProcessEventPipeline.js` sans réécriture du runtime.

### Négatives

- L'intégration au pipeline n'est pas encore faite (actionnement des processus absent) ;
- Les phases 6–12 (hypermutation structurée, affinity maturation, foraging général, replay causal, évolution, transmission) sont reportées ;
- Le SearchPressureModel ne gère qu'une échelle temporelle (pas de lignée/évolution pour l'instant) ;
- Le Ledger reste en mémoire (pas de persistance SQLite).

### Risques

- Le système peut osciller autour des seuils (hystérésis partielle requise) ;
- Les agents existants ne sont pas encore pilotés par ce plan de contrôle.

## Plan de stabilisation (Phase 5.5)

1. Corriger le modèle de croyance (fait)
2. Normaliser le searchYield (fait)
3. Séparer medium-stagnation de vrai lock-in via le Ledger (fait)
4. Refaire Search Pressure comme signal d'état avec inertie (fait)
5. Brancher tout dans `agentProcessEventPipeline.js` (TODO)
6. Ajouter un `NaturalSearchActuator` qui relie les décisions aux primitives (TODO)
7. Persister le Ledger et la pression (TODO)
8. Ajouter receipts/provenance aux preuves (TODO)
9. Écrire un test E2E complet (TODO)
10. Indexer la documentation et corriger le statut (fait)

## Références

- Spiro, Parkinson & Othmer 1997 — chemotaxie bactérienne (boucle perception → adaptation → comportement)
- Schwab, Casasa & Moczek 2019 — plasticité développementale
- Foster 2007 — mutagenèse de stress
- Bowers, Boyle & Damoiseaux 2018 — maturation d'affinité
