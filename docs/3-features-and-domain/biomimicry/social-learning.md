# Apprentissage Social — Tutorat par Mimétisme

> **Concept** : Les jeunes animaux apprennent en observant les adultes, évitant l'exploration coûteuse et dangereuse de l'environnement.
> **Statut** : implémenté (genos-core::biomimicry::social_learning)

## Bénéfice
Un jeune agent ("Junior") qui débarque dans un espace complexe n'a pas besoin de griller des tokens MCTS pour trouver comment accomplir une tâche. Il peut télécharger et rejouer le DAG causal (la "macro") d'un agent "Senior". S'il atteint un lignment_score élevé, la compétence est considérée comme acquise gratuitement.
