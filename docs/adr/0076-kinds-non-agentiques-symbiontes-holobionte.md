# ADR 0076 — Kinds non agentiques pour les symbiontes Holobionte

- **Statut** : Accepté
- **Date** : 2026-09-24
- **Domaine** : Holobionte, symbiontes, modèles, outils, runtime
- **Décideurs** : GenOS
- **Lié à** : ADR 0052, ADR 0073, ADR 0075

## Contexte

Le Host doit pouvoir composer des ressources spécialisées qui ne sont pas des
agents conversationnels. Modéliser chaque ressource comme un agent incite à créer
des prompts et des cycles de vie inutiles.

## Décision

Chaque `SymbiontInstance` persistée porte un `kind` parmi `AGENT`, `MODEL`, `TOOL`,
`PROCEDURE`, `DAEMON`, `MEMORY`, `VERIFIER`, `DATABASE` et `SUB_TOPOLOGY`. Les
instances historiques sans kind sont interprétées comme `AGENT`. Toute nouvelle
valeur hors registre est rejetée avant la validation de l'événement transactionnel.

## Conséquences

### Positives

- Les symbiontes représentent des organes ou ressources typés sans créer de faux
  agents.
- Les données historiques conservent le comportement existant.
- Les consommateurs peuvent discriminer les ressources sur un registre borné.

### Négatives

- Les nouvelles catégories nécessitent une extension explicite du registre.
- Les moteurs associés à chaque kind ne sont pas implicitement lancés par ce modèle.

## Alternatives

- Traiter tout symbionte comme un agent : rejeté, car cela impose une abstraction
  conversationnelle à des outils, mémoires et bases de données.
