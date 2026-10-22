# ADR 0327 — Complétion de la nosologie : calibration, porte de promotion et parcours e2e

**Statut** : Accepté — les portes de validation restent ouvertes
**Date** : 2026-10-22
**Domaine** : Nosologie, clinique computationnelle et preuves
**Décideurs** : Équipe GenOS

## Contexte

L'ADR 0326 a instauré le catalogue versionné `shared/nosology.json` (28 conditions, 9 familles, 48 contrats de marqueurs), le diagnostic par seuil > 0,5, l'application signée et persistante, et l'idempotence. Le dépôt fournit aussi une campagne de calibration sans observations, une agrégation candidate `noisy_or_v2`, ainsi que des contrats exécutables pour les variantes du catalogue. Les valeurs `0.5` et `0.25` restent des défauts d'ingénierie.

Les décisions suivantes complètent le contrat logiciel, sans déclarer la calibration ni la promotion terminées :
- `calibration.status = uncalibrated_engineering_defaults` ; les seuils (0,5) et quantités (0,25) sont des défauts d'ingénierie sans campagne de train/disjoint holdout ni campagne benefit/harm vérifiée.
- La porte de promotion (`verified_train_and_disjoint_holdout_campaign`, `verified_benefit_harm_campaign`, `verified_common_holdout_against_raw_family_max_and_no_change`) n'est pas franchie.
- `npm --prefix backend test`, `npm test` à la racine et `cargo test --workspace --jobs 1` passent le 2026-10-22. Le gate qualité trouve une violation préexistante et aucune nouvelle. Le bilan de preuve consigne les contrôles exécutés et les limites restantes.
- Le parcours HTTP → Rust avec reprise après redémarrage a été rejoué le 2026-10-22 et passe (`test:clinical-rust-e2e`).
- Le CLI lie la revalidation au claim durable, à son jeton et à son lease juste avant l'application. La course est définie par cet ordre : révocation avant claim bloque l'application; claim avant révocation permet à l'opération réservée de terminer ou d'être reprise. Le test du vrai CLI vérifie ces deux ordres, l'idempotence et la reprise après crash. Cela ne revendique pas une transaction distribuée atomique entre SQLite et le journal Rust.
- Les mécanismes biologiques détaillés des fiches restent des analogies. Seuls les opérateurs logiciels présents dans les contrats du catalogue sont revendiqués.

## Décision

- Conserver `maximum_v1` en production et `noisy_or_v2` en candidate shadow. Ne changer les seuils, quantités ou statut de calibration qu'après validation d'observations réelles, indépendantes, signées et disjointes selon la campagne.
- Traiter chaque variante de marqueur comme un contrat logiciel borné. Refuser l'application sur cellule apoptotique, lorsque la garde de thrombolyse est insuffisante ou lorsqu'un marqueur de risque fourni est invalide.
- Faire valider par le backend le jeton et le lease du claim juste avant l'application Rust. La révocation bloque tout nouveau claim; un claim antérieur conserve l'autorité de son opération selon les règles de lease et de reprise. Ne pas présenter ce protocole comme une transaction distribuée entre SQLite et le journal.
- Mettre à jour le catalogue généré, le bilan de preuve et les documents de nosologie avec les résultats réellement observés. Garder les échecs des contrôles globaux visibles et hors des déclarations de promotion.

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
