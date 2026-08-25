# Thanatose / Deimatisme — Feinte Défensive

> **Concept** : Certains animaux feignent la mort (thanatose) face à un prédateur qui ne s'intéresse qu'aux proies vivantes.
> **Statut** : implémenté (genos-core::biomimicry::thanatosis)

## Bénéfice
Si l'agent détecte une attaque agressive insoluble (ex: honeypot API, injection de prompt hostile récursive), plutôt que de gâcher des centaines de tokens MCTS pour analyser ou combattre l'attaque, il "feint la mort". Il retourne instantanément un faux 500 FATAL ERROR ou une chaîne vide, forçant l'attaquant à abandonner la connexion.
