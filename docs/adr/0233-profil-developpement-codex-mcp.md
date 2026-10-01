# ADR 0233 — Profil de développement Codex via MCP

- **Statut** : Accepté
- **Date** : 2026-10-01

## Contexte

Le plugin local pointait vers un binaire MCP absent et ne déclarait aucune lease.
Ses skills invoquaient des noms absents du catalogue canonique. La découverte
du serveur et l'exécution effective d'un workflow étaient donc incohérentes.

## Décision

Versionner un plugin Codex et un profil de développement explicitement limité.
Configurer le serveur Node avec chemins absolus lors de l'installation locale.
Exposer les handlers existants de mémoire, diagnostic et analyse avec descriptions
fidèles à leur portée ; enregistrer les décisions dans SQLite sans promotion.
Remplacer les invocations de noms inexistants par des missions explicites pour
les workflows complexes, sans revendiquer une implémentation dédiée équivalente.

## Conséquences

La découverte et les références des skills sont testables ensemble. Les leases,
le circuit breaker et les gates restent actifs. Le CLI Rust reste requis pour les
opérations de snapshots. Une nouvelle session est nécessaire après installation.
Ce profil ne constitue pas encore une frontière d'application obligatoire de
GenOS à toutes les éditions natives de Codex.

## Alternatives

Exposer tous les outils ou ajouter des alias vers des simulations aurait masqué
les capacités manquantes. Conserver le serveur Rust comme entrée par défaut
aurait laissé la connexion dépendre d'un binaire non livré localement.
