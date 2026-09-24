---
title: Contrats worker avec autorite et delegation bornees
date: 2026-09-24
status: accepted
authors: GenOS
decision-id: 0063
---

# ADR 0063 : Contrats worker avec autorite et delegation bornees

## Contexte

L'ADR 0043 définit un runtime worker commun et des phénotypes composables. L'audit des presets a relevé que `WorkerRuntimeContract` ne représentait pas l'autorité de promotion, le budget de spawn ni la profondeur de délégation. `check_action` ne pouvait donc pas bloquer une promotion ni imposer les plafonds annoncés pour `SubOrchestrator`.

## Décision

- Ajouter `promote` à `AuthorityProfile`, refusé par défaut pour les workers.
- Ajouter `spawn_budget` et `delegation_depth` au contrat. Un contrat qui autorise le spawn doit avoir un budget positif et un lease `spawn_capped`. Un contrat sans spawn ou délégation doit garder ses budgets à zéro.
- Ajouter à `ActionRequest` les intentions de promotion et délégation, le nombre de spawns actifs et la profondeur demandée. `check_action` refuse la promotion sans autorité, le spawn sans autorité ou au-delà du budget, ainsi que la délégation au-delà du plafond.
- Les champs absents dans les contrats et actions sérialisés sont initialisés avec les valeurs par défaut, notamment `promote=false` et les budgets nuls.
- Configurer `SubOrchestrator` avec cinq spawns maximum et une profondeur de délégation. Les autres types de worker ont un budget de spawn et une profondeur nuls.
- Garder les contrôles comme fonctions pures du crate Rust. Cet ADR ne raccorde pas encore ces contrôles aux dispatchs Node ou aux autres chemins runtime.

## Conséquences

### Positives

- Les garanties de non-promotion et de délégation plafonnée sont représentables et testables dans le contrat.
- Les presets incohérents sont rejetés par `validate_contract`.

### Négatives

- `WorkerRuntimeContract` et `ActionRequest` évoluent ; les consommateurs Rust qui construisent ces structures doivent adopter les nouvelles dimensions.
- L'ADR 0064 ajoute une application Node des limites pertinentes aux missions backend. Le crate Rust reste une implémentation indépendante et le dispatch imbriqué Node demeure refusé.

## Alternatives

- Laisser ces limites dans les commentaires et prompts : rejeté, elles ne seraient ni vérifiables ni opposables au runtime.
- Accorder des permissions de promotion au worker créatif : rejeté, un candidat créatif doit passer par les gates du parent.
