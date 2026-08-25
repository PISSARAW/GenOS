# Biomimétisme & Taxis : Mouvements Orientés Élémentaires

> Domaine : éthologie / physiologie sensorielle (taxis et kinésies) — Statut : proposition de recherche

## 1. Fondement biologique
Avant toute intelligence complexe, la vie se déplace par **taxies** : orientation directe vers ou contre un gradient (phototaxie, chimiotaxie des bactéries via bias random walk). Les kinésies, plus simples encore, modulent la vitesse de mouvement aléatoire selon l'intensité du stimulus. Coût computationnel : quasi nul. Efficacité : remarquable — E. coli trouve une source nutritive avec ~4 bits d'état interne.

## 2. Formalisation GenOS
```
Taxis(C, champ F) :
  mesurer ∇F à la position courante (F = concentration phéromonale, densité d'artefacts pertinents, signal utilisateur…)
  marche biaisée : probabilité de pas vers +∇F augmentée ; pas aléatoires sinon (exploration minimale)
Kinèse(C, F) : vitesse/taux de fork modulée par |F| sans direction (encore plus simple)
Cas d'usage minimal : agents « spores actives » sans LLM qui convergent vers les zones riches en tâches
```

## 3. Mapping primitives existantes
- Champs phéromonaux (`swarm.rs`, évaporation/diffusion) — gradients déjà calculables.
- `genos-eval/src/prm.rs` (gradients positionnels morphogéniques) — infrastructure de champs partagée.
- Budgets AMPK — la kinèse module naturellement le gouverneur énergétique.

## 4. Cas d'usage
- Flotte de micro-agents de veille qui convergent vers les répertoires les plus actifs d'un codebase.
- Comportement par défaut des agents embryonnaires avant acquisition de capacités supérieures.

## 5. Apports attendus
- Comportement de base ultra-économique pour agents minimaux (pas de tokens consommés).
- Étage inférieur robuste sous les mécanismes sophistiqués (flocking, MCTS) : dégradation gracieuse.
- Validation empirique bon marché des infrastructures de gradients.

## 6. Points d'intégration
`genos-core/src/organization/taxis.rs` (nouveau), réutilise le moteur de diffusion phéromonale.
