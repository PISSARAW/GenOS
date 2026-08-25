# Biomimétisme & Checkpoints du Cycle Cellulaire : Gates de Progression Obligatoires

> Domaine : biologie cellulaire (cycle cellulaire, CDK) — Statut : proposition de recherche

## 1. Fondement biologique
La cellule ne progresse jamais aveuglément dans son cycle : les checkpoints G1/S (ADN intact ? ressources ?), G2/M (réplication complète ?), M/spindle (chromosomes attachés ?) bloquent la progression tant que leurs prédicats ne sont pas satisfaits. Un checkpoint défaillant = cancer. La règle est absolue : **pas de phase suivante sans validation formelle de la précédente**.

## 2. Formalisation GenOS
```
CycleVital(C) = Init → Fork → Run → Diff → Merge, avec gates :
  Gate_fork  : génome cohérent + niche disponible + budget alloué
  Gate_run   : monde scellé (snapshot σ pré-run) + invariants génotype/état respectés
  Gate_diff  : diff complet + reproductibilité du replay vérifiée
  Gate_merge : validations Pareto + preuve d'hérédité + absence de fuite inter-mondes
Propriété clé : un gate échoué ne « skip » jamais — il bloque, répare ou apoptose.
Chaque passage de gate est un événement signé du DAG.
```

## 3. Mapping primitives existantes
- Merge gating existant (« merge only what passes checks ») — le checkpoint M existe déjà en germe ; il faut systématiser aux autres phases.
- Snapshots Merkle — preuves des gates.
- `resilience/cellular.rs` — apoptose comme issue d'un gate irrécupérable.

## 4. Cas d'usage
- Refus automatique de fork si le budget projeté dépasse la capacité (checkpoint G1).
- Blocage de merge tant que la reproductibilité n'est pas démontrée sur rejeu indépendant.

## 5. Apports attendus
- Formalisation uniforme des garde-fous existants (au lieu de règles éparses par phase).
- Prévention structurelle des états corrompus : l'erreur coûteuse est interceptée à sa gate.
- Audit trivial : la chaîne des gates signés raconte tout le cycle vital.

## 6. Points d'intégration
`genos-runtime/src/genome_os/checkpoints.rs`, formalisation dans `spec/GENOME_SPEC.md`.
