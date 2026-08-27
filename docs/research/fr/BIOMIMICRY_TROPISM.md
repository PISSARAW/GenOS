> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Tropismes : Orientation Continue vers les Signaux Positifs

> Domaine : physiologie végétale (phototropisme, gravitropisme, auxines) — Statut : proposition de recherche

## 1. Fondement biologique
La plante oriente sa croissance de façon continue et lente vers les signaux favorables (lumière via redistribution d'auxines) et contre les défavorables (gravité pour les racines selon le besoin). Contrairement au mouvement animal, c'est une **croissance asymétrique** : on ne se déplace pas, on pousse différemment. Le tropisme est permanent, cumulatif, sans décision discrète.

## 2. Formalisation GenOS
```
Tropisme(C, champ S = {feedback utilisateur positif, succès de merges, densité de tâches utiles}) :
  à chaque cycle de planification, réallouer ε % supplémentaire du budget/effort vers +∇S
  (croissance différentielle : pas de déplacement, mais dérive progressive des allocations)
Contre-tropisme : désallocation symétrique des zones à signal négatif persistant
Propriétés : continu (pas de décision binaire), lent (constante τ élevée), cumulatif, toujours actif en fond
```

Différence avec taxis (doc sœur) : taxis déplace un agent ; tropisme réoriente les allocations internes d'un même agent.

## 3. Mapping primitives existantes
- Budgets AMPK — vecteur de réallocation.
- Signaux de fitness (`pareto.rs`, RPE) — champs S mesurables.
- `prm.rs` gradients — infrastructure commune des champs.

## 4. Cas d'usage
- Un agent polyvalent dont l'allocation de temps dérive doucement vers les types de tâches où il réussit — sans reprogrammation explicite.
- Élagage progressif des dépendances rarement utiles.

## 5. Apports attendus
- Autopilotage doux et réversible, complémentaire aux décisions discrètes (forks, mutations).
- Zéro coût cognitif : mécanisme de fond, sous la réflexion.
- Adaptation cumulative documentée dans les budgets historiques.

## 6. Points d'intégration
Couche tropique dans les politiques budgétaires (`ampk.rs`), champ S alimenté par les événements de fitness.
