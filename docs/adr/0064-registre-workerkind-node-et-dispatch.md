---
title: Registre WorkerKind Node et propagation au dispatch
date: 2026-09-24
status: accepted
authors: GenOS
decision-id: 0064
---

# ADR 0064 : Registre WorkerKind Node et propagation au dispatch

## Contexte

L'ADR 0043 et le crate `genos-worker` définissent 19 types canoniques. Le backend Node utilisait surtout des rôles et un petit ensemble de phénotypes d'autorité ; un type choisi pouvait donc être perdu entre l'affectation, l'incarnation et l'exécution.

## Décision

- Maintenir dans `workerKindService` le catalogue Node aligné sur les identifiants Rust, avec aliases de rôles, famille, consigne de mission, profil d'autorité de base et artefact attendu.
- Résoudre le type explicite en priorité, refuser les identifiants explicites inconnus et utiliser `bounded_worker` comme défaut sûr pour les rôles non reconnus.
- Persister le type et le contrat dérivé dans `agents.metadata_json` et transmettre le type au dispatch. L'incarnation reconstruit le contrat côté serveur ; les données fournies par l'appelant ne définissent pas l'autorité.
- Garder les profils d'autorité Node comme couche de permissions projetée. Le backend applique les invariants pertinents au moyen de son enforcement Node ; il ne charge pas le crate Rust et les deux runtimes restent séparés.
- Refuser par défaut les actions MCP qui dépassent l'autorité effective et exiger un `workerArtifact` typé, avec les champs sémantiques et la provenance requis, avant de valider un dossier.
- Désactiver spawn et délégation pour `sub_orchestrator` dans Node tant que le dispatch worker-enfant n'existe pas ; ne pas exposer un budget que le runtime n'applique pas.

## Conséquences

### Positives

- Le type reste identifiable depuis la sélection jusqu'à la mission worker et peut être contrôlé contre le registre Rust.
- Les permissions et limites sont recalculées côté serveur et la compatibilité historique des agents sans métadonnées est conservée.

### Négatives

- Les profils génériques Node ne reproduisent pas toute la sémantique des presets Rust.
- Le backend applique une traduction Node des invariants, pas l'implémentation Rust elle-même ; toute divergence nécessite des tests de parité.
- Le sous-orchestrateur Node ne peut pas encore lancer de workers enfants.

## Alternatives

- Traiter le rôle de mission comme identifiant de type : rejeté, les rôles sont des alias opérationnels et incomplets.
- Appeler les presets Rust depuis Node : différé, aucun pont runtime sûr et défini n'existe dans l'architecture actuelle.
