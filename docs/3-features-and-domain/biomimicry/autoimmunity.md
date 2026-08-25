# Auto-immunité — Régulation T-Cell

> **Concept** : Le système immunitaire attaque par erreur les tissus sains (faux positifs). Les cellules T régulatrices sont là pour stopper ce massacre.
> **Statut** : implémenté (genos-core::biomimicry::autoimmunity)

## Bénéfice
L'Apoptose et l'Inflammation sont des défenses puissantes. Trop sensibles, elles peuvent tuer des workflows sains (ex: un faux positif du linter docker-linter qui tue l'agent en boucle). Le AutoImmunityRegulator compte les kills récents et supprime la réponse immunitaire si le taux dépasse le seuil, sauvant ainsi la flotte d'un suicide collectif.
