---
title: Medecine graduee et immunite proportionnee
date: 2026-09-23
status: accepted
authors: GenOS
decision-id: 0041
---

# ADR 0041 : Médecine graduée et immunité proportionnée

## Statut

- **Statut** : Accepté
- **Date** : 2026-09-27 (proposé le 2026-09-23, accepté le 2026-09-27)
- **Domaine** : Santé agentique, immunité, thérapies, quarantaine, iatrogénie
- **Décideurs** : GenOS
- **Lié à** : [0040](0040-morphogenese-git-contrefactuel.md), [0039](0039-systemes-vitaux-agents-6-10.md), [0003](0003-fossilization-stratigraphic-archive.md)

## Contexte

Le médical existe mais n'est pas encore le médecin permanent de l'organisme :

- Rust : `crates/genos-cell/src/clinical.rs` (`ClinicalState` minimal : pathologies, inflammation, quarantaine, dernier traitement, log), `crates/genos-biology/src/pathology.rs` (5 catégories : auto-immune, nosocomiale, iatrogène, dégénérative, infectieuse), `crates/genos-biology/src/therapy.rs` (`Therapy`, `SystemicTherapy`, `TherapyOutcome{cured, induced_side_effects}` avec début d'iatrogénie `Corticosteroids>0.8 → SteroidInducedComa`), `crates/genos-orchestrator/src/clinical_therapy.rs` (table `pathology → thérapie`), `crates/genos-orchestrator/src/immune_cyber.rs` (autotomie/honeypots, circuit breaker, gossip, régénération) ;
- JS : `backend/src/services/medical/clinicalStateService.js` (canonique : état enrichi : vitals, wellnessScore, plasmidLoad, immuneTiter, pathogenBurden, iatrogenicLoad, cellCycleState), doublon miroir constaté `backend/src/services/clinicalStateService.js` (à dédupliquer ou sceller comme façade), `backend/src/services/medical/immuneSurveillanceService.js` (8 définitions `mutation_drift, plasmid_overload, immune_exhaustion, iatrogenic_toxicity, cell_cycle_malignancy, cognitive_metastasis, inflammatory_cytokine_storm, quarantine_breach` avec `detect/severity/evidence/therapy/minConfidence`, sans miroir racine), `backend/src/services/medical/clinicalTherapyService.js` (table `THERAPIES` : `maxDosage, baseIatrogenicRisk, efficacyCurve, iatrogenicManifestations`) ;
- docs : `docs/01-concepts/nosologie/` (auto-immunes, dégénératives, infectieuses, génétiques, cancers, métaboliques, cardiovasculaires, psychiatriques, environnementales) ;
- ADR 0039 : médecine (réparer) ≠ résilience (continuer malgré la panne).

Manquent le caractère obligatoire de la chaîne diagnostique, la définition opposable maladie vs échec, et le passage obligé par le contrefactuel avant thérapie destructive.

## Décision

Rendre la médecine transverse avec trois règles dures :

1. **Maladie ≠ échec ordinaire.** Un worker qui échoue = incident. Un processus pathologique exige persistance + dysfonction + au moins un marqueur parmi : réplication hors niche, attaque de composants légitimes, signal nuisible inter-agents, dégradation progressive mémoire/procédures, mutation héréditaire invalidante, consommation incontrôlée de ressources, évasion de gouvernance, corruption d'evidence. Le cancer morphogénétique (`ignore apoptose + réplication hors niche + spawn sans autorité + demande ressources continue + évasion + corruption evidence`) devient un ensemble d'invariants détectables (`cell_cycle_malignancy`, `cognitive_metastasis`).
2. **Chaîne graduée, jamais `weird → apoptosis`.** Le parcours implémenté est `surveillanceScan → biopsy → diagnose → therapy proportionnée → monitor`. `surveillanceScan` applique `minConfidence` pour retenir une détection; `diagnose` confirme ensuite si le score dépasse `0,5` et la sévérité `0,3`. Le score JS est déterministe (`clamp(severity) × 0,7 + 0,3`), avec repli sur la confiance enregistrée si la sévérité est invalide; il ne combine pas les autres mesures de biopsie et n'est pas une probabilité calibrée. Les événements sont enregistrés par `recordImmuneEvent` dans SQLite. Cela ne constitue pas un commit AgentGit automatique; une version persistante relève du pipeline explicitement appelé de l'ADR 0040.
3. **Thérapies proportionnées avec iatrogénie explicite.** Échelle : `correction homéostatique → suppression plasmidique → reset épigénétique/déméthylation → sleep/reset/strategy switch → isolation de capacité → quarantaine → inhibition du cycle cellulaire → apoptose ciblée` (dernier recours, double validation). Chaque `TherapyPlan` porte `expectedBenefit, collateralDamage, iatrogenicRisk, reversibility, monitoringSignals, rescueTherapy` — déjà partiellement modélisé par `efficacyCurve + iatrogenicManifestations + maxDosage` côté JS et `TherapyOutcome.induced_side_effects` côté Rust. Toute thérapie destructive (quarantaine, inhibition, apoptose) passe d'abord par le gate contrefactuel ADR 0040 (`F0 = sans traitement / F1..Fn = thérapies candidates` en capsules VFS).

## Conséquences

Positives :

- l'auto-immunité GenOS est contenue : pas d'exécution sans biopsy ni gate ;
- l'iatrogénie devient mesurable (risque, dose, réversibilité, sauvetage) au lieu d'un `if pathologie → traitement` ;
- le médical devient le `Morphogenesis Repair System` : diagnostiquer, tester en VFS, réparer, committer, fossiliser en cas d'extinction.

Négatives :

- latence diagnostique (quarantaine + biopsy + forks) même sous pression ; prévoir une voie `homeostatic correction` rapide sans fork pour les dysfonctions mineures ;
- le `ClinicalState` Rust enrichi (santé, intégrité, états immunitaire/métabolique, fardeau mutationnel, santés communication/mémoire/cognitive, historique, risques) reste à implémenter en petites PRs (gate ≤400 lignes, ≤3 params, CC ≤10) ;
- `therapy_extended.rs` est un stub (`safety_block`, `apply_extended_therapy` vides) : à brancher ou supprimer.
- Preuve rejouée le 2026-09-27 : code Rust et JS constatés aux chemins ci-dessus ; couverture par tests indirects (`test_immune_*`, `test_quarantine_*`, dont `test_immune_system.js`, `test_quarantine_runtime.js`, `test_quarantine_release.js`) non rejouables dans cet environnement (binding natif `sqlite3` invalide, `ERR_DLOPEN_FAILED`), à rejouer sur environnement sain — aucune défaillance de code constatée.

## Alternatives

- Tuer tout agent suspect (`apoptose immédiate`) : rejeté, auto-immunité garantie, perte d'evidence.
- Confondre médecine et résilience : rejeté (ADR 0039) — la résilience dégrade gracieusement et continue la mission, la médecine diagnostique et répare.
- Thérapie sans risque modélisé : rejeté, contredit `TherapyOutcome` et la table `THERAPIES` déjà iatrogènes.
