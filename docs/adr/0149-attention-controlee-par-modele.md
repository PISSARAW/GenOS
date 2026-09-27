# ADR 0149 — Attention contrôlée par son modèle

- **Statut** : Accepté (portée Node ; sans équivalent Rust ni `spec/`)
- **Date** : 2026-09-27 (normalisation ; ébauche antérieure non datée)
- **Domaine** : Attention, allocation de ressources, leases
- **Décideurs** : Mainteneurs GenOS (control plane Node)
- **Lié à** :
  - `../../backend/src/services/modelControlledAttentionService.js` (`predictAllocation`, `reallocate`, `scorePrediction`)
  - Tests : `../../backend/tests/test_model_controlled_attention.js`

## Contexte

L'attention allouait des leases aux spécialistes sans prédire leur demande depuis l'état courant ni mesurer ensuite l'accord entre prédiction et requêtes réellement observées.

## Décision

Le modèle prédit la demande des spécialistes depuis l'état courant (`baseDemand` + état indexé par `stateKey`), attribue un budget de leases aux mieux prédits, et mesure ensuite l'accord avec les requêtes réellement observées (indice de Jaccard prédit/observé). Une réallocation est une intervention explicite ; les leases seuls ne valent pas preuve de la prédiction.

## Conséquences

- Positives : prédiction vérifiable contre l'observé, budget explicite, leases tracés avec demande prédite.
- Négatives : portée Node uniquement — aucun pendant Rust, aucune `spec/` ; la prédiction additive et le Jaccard sont rudimentaires.
- Neutres : le score vaut 1 par convention quand prédit et observé sont tous deux vides.

## Alternatives

- **Allocation sans modèle (premier arrivé)** : rejetée — non prédictive, non évaluable.
- **Leases valant preuve** : rejetée — confond allocation et justesse de la prédiction.
