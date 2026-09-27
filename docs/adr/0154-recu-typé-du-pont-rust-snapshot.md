---
title: Reçu typé du pont Rust pour les snapshots
date: 2026-09-27
status: accepted
authors: Bruney
decision-id: 0154
---

# ADR 0154 : importer un snapshot Rust avec preuve Node

- **Statut** : Accepté (portée Node + pont CLI Rust ; voir Limites)
- **Date** : 2026-09-27
- **Domaine** : Pont Rust/Node, snapshots, provenance
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/rustBridgeEvidenceService.js` (`buildSnapshotReceipt`)
  - `../../spec/snapshot.schema.json` (schéma de conformité exigé)
  - Tests : `../../backend/tests/test_rust_bridge_snapshot_evidence.js`
- **Note** : collision numérique avec `0154-fitness-pareto-destins.md` (même numéro, sujet distinct ; renumérotation interdite sans migration de provenance, voir ADR 0005 — traiter dans l'index, jamais par `git mv`).

## Contexte

Le contrôleur Studio exécutait `genos-cli`, retournait son résultat et calculait
une validation de schéma, sans utiliser l'échec de cette validation pour
décider si le snapshot était recevable. Le succès du processus Rust pouvait
donc être interprété comme une preuve Node de validité.

## Décision

La route de création d'un snapshot Rust exige à la fois un code de sortie nul
et un objet conforme à `spec/snapshot.schema.json`. Elle écrit ensuite un reçu
`genos.rust-bridge-snapshot/v1` dans `provenance_records`, avec le hash du
payload, le scope organisation/projet et l'identifiant du snapshot. Un échec
de validation ou de persistance empêche la réponse de succès.

## Limites

Ce reçu prouve la conformité du snapshot importé et le résultat du CLI. Il ne
transfère pas automatiquement les garanties des autres crates Rust à
l'orchestrateur Node. Chaque opération Rust influençant une décision doit
recevoir son propre contrat, son propre gate et une observation persistée.

## Conséquences

- Positives : le succès du processus Rust ne vaut plus preuve Node ; reçu typé avec hash et scope, persistance exigée.
- Négatives : garanties limitées au snapshot importé, sans transfert aux autres crates Rust.
- Neutres : le front-matter historique de ce fichier est conservé tel quel.

## Alternatives

- **Succès processus = succès preuve** : rejetée — confondait transport et décision valide.
- **Renumérotation du doublon `0154`** : rejetée sans migration de provenance (ADR 0005) — la collision est documentée dans l'index à la place.
