> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Architecture EPIC 2 : MCTS & PRM

Ce document décrit l'architecture du module de recherche arborescente contrefactuelle (MCTS) et du Process Reward Model (PRM) implémentés dans `genos-eval`.

## 1. Process Reward Model (PRM)
Le trait `ProcessRewardModel` (`prm.rs`) évalue la viabilité d'une étape de raisonnement intermédiaire.
Il renvoie un `StepScore` et permet de décider si une branche doit être élaguée (*Early Pruning*).
Les évaluations dépendent du `EvalContext`, qui encapsule de multiples paramètres environnementaux (sans dépasser la limite stricte de 3 paramètres par fonction).

## 2. MCTS & Modèles Bio-Inspirés
L'arbre de recherche de GenOS v2 n'est pas un algorithme UCT standard. Il intègre des composants biologiques :
- **Neuroplasticité STDP** : Les nœuds MCTS (`MctsNode`) ne stockent pas une simple moyenne de victoires. Ils utilisent un **Poids Synaptique** (`synaptic_weight`). Lors de la rétropropagation (`backpropagate`), la causalité temporelle (`delta_t`) modifie ce poids (Potentialisation vs Dépression).
- **Régulateur AMPK** : Le champ `energy_charge` du contexte d'évaluation (`EvalContext`) module dynamiquement l'énergie disponible pour la recherche. Un `energy_charge` faible empêchera l'exploration profonde.
- **Morphogenèse de Turing** : Le champ `positional_gradient` est mis à jour via une équation de réaction-diffusion (Gierer-Meinhardt). Il différencie les agents au fil des branches selon le gradient morphogénétique local.

## 3. Conformité aux Règles d'Or GenOS
- **Complexité** : La complexité cyclomatique est réduite à néant grâce aux Traits découplés et à un code linéaire.
- **Fichiers Courts** : Le code est fragmenté sémantiquement en `mcts.rs`, `prm.rs`, et `outcomes.rs`.
- **Paramètres** : L'utilisation de `EvalContext` évite la prolifération des paramètres (maximum 3 paramètres par signature).
