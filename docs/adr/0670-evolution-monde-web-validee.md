# ADR 0670 — Évolution du monde web validée par observation réelle

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Domaine** : monde contrefactuel, modèle du monde, SHEV, calibration, preuve
- **Décideurs** : équipe GenOS
- **Lié à** : ADR 0019, ADR 0022, ADR 0622

## Contexte

Une simulation de parcours web peut produire rapidement plusieurs futurs plausibles,
mais elle ne mesure pas l'effet du changement sur le monde réel. Un score synthétique
élevé ne doit donc ni entraîner directement une action hors mandat, ni mettre à jour
le modèle du monde comme si l'effet avait été observé.

GenOS disposait déjà de branches contrefactuelles, d'un modèle du monde et de
responsabilités SHEV persistées. Il manquait un contrat vertical qui les relie :
comparabilité des prédictions, décision bornée par le risque et le coût, observation
indépendante, calibration et provenance de l'effet.

## Décision

Le service `counterfactualWorldEvolutionService` introduit trois étapes.

1. `planScenarios` accepte deux à quatre candidats partageant la même métrique et le
   même horizon. Chaque branche reçoit un namespace isolé et les marqueurs
   `counterfactual_simulated`, `synthetic` et `promotionAllowed: false`. Le baseline
   porte une référence de preuve observée.
2. `decideAction` évalue l'utilité attendue sous plafonds de risque et de coût. Une
   permission `observe`, `diagnose`, `instrument` ou `delegated_action` est résolue
   contre le mandat SHEV actif et sa version persistée. Le résultat est
   `PROPOSE_ACTION` ou `ABSTAIN`, jamais une promotion.
3. `validateObservation` refuse les résultats synthétiques et l'auto-vérification.
   Seule une observation réelle, indépendante et munie d'une provenance peut résoudre
   la prédiction enregistrée. L'effet conserve le mandat versionné, met à jour le
   modèle du monde et ajoute un score de Brier agrégé.

Même après validation, `promotionAllowed` reste faux et
`requiresPromotionGate` reste vrai. Le reçu d'effet est une preuve candidate pour une
porte de promotion distincte, pas l'autorisation de promouvoir.

Ce cycle emprunte au cerveau prédictif la correction par erreur de prédiction, tout en
conservant une séparation immunitaire entre imagination et perception. La
responsabilité SHEV joue le rôle d'un territoire homéostatique durable : si elle est
retirée ou révisée, l'observation ne peut plus valider l'ancienne décision.

## Conséquences

### Positives

- les mondes synthétiques restent isolés et explicitement non promotionnels ;
- le choix d'une action est reproductible à partir du risque, du coût et du mandat ;
- la calibration Brier relie chaque prédiction à une observation indépendante ;
- les effets conservent la provenance et la responsabilité qui autorisaient la décision.

### Négatives

- le service ne fournit pas lui-même l'exécuteur web ni l'oracle réel ;
- les seuils de risque, de coût et d'utilité restent des politiques appelantes ;
- un changement de mandat impose une nouvelle décision avant validation ;
- la calibration locale ne démontre pas une généralisation à d'autres domaines.

## Alternatives

- **Promouvoir la meilleure simulation** : rejeté, car la simulation n'est pas une
  observation du monde réel.
- **Apprendre depuis tout résultat d'exécution** : rejeté, car le planificateur ou
  l'exécuteur pourraient s'auto-confirmer.
- **Autoriser selon un booléen éphémère fourni par l'appelant** : rejeté au profit du
  mandat SHEV versionné et persisté.

## Vérification

- `node backend/tests/test_counterfactual_world_evolution.js`
- `python scripts/ci/check_code_quality.py`
- `python scripts/ci/check_adr_index.py`
