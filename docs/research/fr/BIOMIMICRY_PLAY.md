> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Jeu Animal : Exploration Sans Enjeu

> Domaine : éthologie (jeu social/locomoteur/objet) — Statut : proposition de recherche

## 1. Fondement biologique
Les jeunes mammifères consacrent une part significative d'énergie au **jeu** : activité sans but immédiat, sans conséquence de survie, souvent coûteuse. Ses fonctions documentées : entraînement sécurisé des compétences, découverte des limites, créativité comportementale (recombinaisons improbables), régulation sociale. Le jeu est reconnaissable à ses critères (Bekoff) : incomplet, spontané, répété, « as if » (débranché des conséquences).

## 2. Formalisation GenOS
```
PlayBudget(C) = fraction φ_play du budget, protégée (non réallouable par AMPK sauf famine extrême)
Propriétés du mode jeu :
  - exécution dans monde jetable (CoW), résultats NON promus, fitness non comptabilisée
  - mutations d'exploration autorisées au-delà des seuils normaux
  - journalisation complète mais marquée play=true
Récolte : les découvertes intéressantes issues du jeu sont candidates à re-exécution sérieuse (promotion explicite)
```

Différence avec l'exploration MCTS : pas d'objectif ni de score — c'est la sérendipité qui est recherchée, pas l'optimum.

## 3. Mapping primitives existantes
- `genos-world` (mondes jetables CoW) — terrain de jeu idéal.
- Budgets de capsule — ajout d'une enveloppe protégée.
- Fossiles/spores — archivage des trouvailles sérendipitaires.

## 4. Cas d'usage
- Nuit de « jeu » hebdomadaire pour la flotte : combinaisons d'outils jamais testées en production.
- Développement des jeunes agents : phase de jeu avant spécialisation (cf. néoténie).

## 5. Apports attendus
- Découvertes sérendipitaires systématiquement cultivées plutôt que subies.
- Régulation saine exploration/exploitation : le jeu absorbe la pulsion exploratrice hors des cycles critiques.
- Zéro risque : tout se passe en mondes jetables.

## 6. Points d'intégration
Politique de budget `play` dans les capsules, CLI `genos play --budget`, outil MCP `biomimicry_play_session`.
