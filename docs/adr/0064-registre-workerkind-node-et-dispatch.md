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
- Raccorder `genos_delegate_worker` au contrat `sub_orchestrator` persistant avec une profondeur maximale de un, cinq enfants au plus, une allowlist fermée, une expiration d'une heure et un budget enfant plafonné. Le contrôleur MCP fournit l'identité d'agent qu'il a résolue depuis le principal authentifié. Le chemin attend et rapporte le résultat de `startMission`.

## Vérification de parité (2026-09-25)

Le test `backend/tests/test_worker_kind_registry.js` compare les 19 identifiants Rust à `KINDS` Node, puis compare `family_of()` et l'artefact final de chaque branche `preset_for()` à la famille et à l'artefact Node. Il contrôle aussi des écarts de contrat connus : `formal_worker` hérite du budget nul du preset procédural en Rust, tandis que le contrat Node ne modélise pas les budgets de ressources; le `sub_orchestrator` Rust porte spawn/délégation dans son preset, tandis que Node part d'un contrat non délégant puis applique explicitement `grantBoundedDelegation()` avant persistance.

Cette vérification porte sur les champs comparables du catalogue et sur quelques divergences choisies. Elle ne prouve ni l'équivalence de tous les champs de `WorkerRuntimeContract`, ni l'interopérabilité des runtimes. Les projections d'autorité, baux d'outils, cognition, mémoire, communication, ressources et cycle de vie restent spécifiques à chaque runtime et doivent être décrits comme telles dans `docs/03-reference/types-de-workers.md`.

## Campagne runtime par kind (2026-09-25)

Le runner `backend/tests/run_worker_compliance_missions.cjs` a exécuté une mission isolée pour chacun des 19 kinds avec `ollama://qwen2.5:14b` : 19/19 ont passé la chaîne contrat persistant lié au parent → exécution → artefact attendu et référence de fixture → validation → statut `completed`. Chaque mission a aussi vérifié le refus d'un artefact mal typé, d'une action topologique interdite et d'une identité altérée. Le rapport de la campagne `1790346642337-40b91b5f` se trouve dans `D:\genos-worker-compliance-final-20260925-163041\worker-compliance-report.json`.

Cette preuve est bornée à une campagne, un modèle et au checkout de travail utilisé (qui contenait d'autres changements locaux non committés). Elle ne démontre pas une fiabilité répétée, une parité sémantique Rust/Node, ni l'authentification et la supervision d'une exécution réelle de worker enfant par `sub_orchestrator`; les limites de délégation ci-dessous restent donc applicables.

## Conséquences

### Positives

- Le type reste identifiable depuis la sélection jusqu'à la mission worker et peut être contrôlé contre le registre Rust.
- Les permissions et limites sont recalculées côté serveur et la compatibilité historique des agents sans métadonnées est conservée.

### Négatives

- Les profils génériques Node ne reproduisent pas toute la sémantique des presets Rust.
- Le backend applique une traduction Node des invariants, pas l'implémentation Rust elle-même ; toute divergence nécessite des tests de parité.
- Les limites de spawn Node sont une traduction locale ; elles ne sont pas exécutées par le crate Rust.
- Les tests actuels du dispatch enfant simulent la base, la création du worker et le runtime ; ils ne démontrent pas encore l'authentification d'un processus worker ni une mission parent-enfant réelle. Le déploiement de cette autorité ne doit donc pas être décrit comme validé de bout en bout.

## Alternatives

- Traiter le rôle de mission comme identifiant de type : rejeté, les rôles sont des alias opérationnels et incomplets.
- Appeler les presets Rust depuis Node : différé, aucun pont runtime sûr et défini n'existe dans l'architecture actuelle.
