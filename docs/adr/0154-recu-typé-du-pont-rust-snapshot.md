---
title: Reçu typé du pont Rust pour les snapshots
date: 2026-09-27
status: accepted
authors: Bruney
decision-id: 0154
---

# ADR 0154 : importer un snapshot Rust avec preuve Node

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
