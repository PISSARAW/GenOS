# ADR 0327 — Complétion de la nosologie : calibration, porte de promotion et parcours e2e

**Statut** : Proposé
**Date** : 2026-10-22
**Domaine** : Nosologie, clinique computationnelle et preuves
**Décideurs** : Équipe GenOS

## Contexte

L'ADR 0326 a instauré le catalogue versionné `shared/nosology.json` (28 conditions, 9 familles, 48 contrats de marqueurs), le diagnostic par seuil > 0,5, l'application signée et persistante, et l'idempotence. Les tests ciblés passent (103 tests Rust ciblés + contrôles Node).

Cependant, la nosologie reste incomplète au sens global :
- `calibration.status = uncalibrated_engineering_defaults` ; les seuils (0,5) et quantités (0,25) sont des défauts d'ingénierie sans campagne de train/disjoint holdout ni campagne benefit/harm vérifiée.
- La porte de promotion (`verified_train_and_disjoint_holdout_campaign`, `verified_benefit_harm_campaign`, `verified_common_holdout_against_raw_family_max_and_no_change`) n'est pas franchie.
- Les contrôles globaux du dépôt sont en échec ou incomplets (`npm test`, `test:worker-workspaces`, `test_consumer_inspection.js`).
- Le parcours HTTP → Rust complet n'est pas validé dans la campagne en cours.
- Une fenêtre non protégée existe entre `validateForCli` (réponse HTTP) et l'append du reçu Rust (thérapie CLI directe) : un second processus peut commettre une révocation entre les deux.
- Certains mécanismes détaillés des fiches spécialisées restent des propositions analogiques sans contrat exécutable associé.

## Décision

Mettre en œuvre un plan en 5 agents (A–E) pour passer la nosologie de l'état *implémenté par contrats* à l'état *complet et validé* :

- **Agent A (Calibration et seuils)** : implémenter l'agrégation `noisy_or_v2` en candidate aux côtés de `maximum_v1`, définir les seuils par condition via campagne train/disjoint holdout, les quantités de thérapie via campagne benefit/harm, et mettre à jour `shared/nosology.json` une fois la porte franchie.
- **Agent B (Validation globale et parcours e2e)** : faire passer `npm --prefix backend test` jusqu'au bout, valider le parcours HTTP → Rust → journal après redémarrage (`test:clinical-rust-e2e`), et corriger ou documenter les tests globaux encore en échec.
- **Agent C (Mécanismes et opérateurs)** : implémenter les mécanismes détaillés des fiches spécialisées (01–09) et les variantes de marqueurs manquantes, en garantissant les gardes (apoptose, thrombolyse `blood_brain_barrier_integrity > 0,5`, risque invalide bloquant l'application).
- **Agent D (Sécurité, autorisations, leases)** : implémenter un protocole de réservation durable ordonnant la révocation et supportant les retries concurrents + reprise après crash ; renforcer le lien mission/cellule/génome/empreinte/digest avant signature ; vérifier les leases MCP (`GENOS_MCP_LEASE`, `GENOS_MCP_DISABLED_TOOLS`).
- **Agent E (Intégration, documentation, preuves)** : générer le catalogue runtime, rédiger le présent ADR, mettre à jour `docs/01-concepts/nosologie/` et `docs/06-qualite-preuves/validation-nosologie.md`, vérifier `check_code_quality.py` (0 dette nouvelle) et l'index ADR.

## Conséquences

- `shared/nosology.json` voit son champ `calibration.status` mis à jour uniquement si une campagne vérifiée le justifie.
- Aucun mécanisme biologique n'est présenté comme une feature physique : maladies et médicaments restent des abstractions logicielles.
- Les tests couvrent chaque condition et chaque contrat (présentes/absentes, invalides, bornes, rémissions, gardes, effets secondaires, absence de résurrection, reçus persistés, restauration, idempotence).
- Aucun commit ne contient `.env`, `*.db`, secrets ou artefacts générés.

## Alternatives

- Conserver l'état actuel (calibration non étayée, porte non franchie) : la nosologie resterait logiciellement cohérente mais non validée pour la promotion.
- Réparer directement tous les sous-systèmes évoqués dans les analogies : ces opérations dépassent le contrat de marqueurs et exigent des preuves et autorisations spécifiques.

## Références

- ADR 0326 — Catalogue nosologique et preuve d'application
- `docs/01-concepts/nosologie/vue-ensemble.md` (§5, §6)
- `docs/06-qualite-preuves/validation-nosologie.md`
- `shared/nosology.json` (champ `calibration`)
- `crates/genos-biology/src/nosology.rs`, `therapy_dispatch.rs`, `therapy_extended.rs`
- `crates/genos-orchestrator/src/authorized_therapy.rs`