> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Sénescence Cellulaire : Détection et Élimination des Zombies

> Domaine : biologie du vieillissement (cellules sénescentes, senolytics) — Statut : proposition de recherche

## 1. Fondement biologique
Une cellule sénescente n'est pas morte : elle vit, consomme, mais ne se divise plus et surtout **sécrète des facteurs inflammatoires** (SASP) qui dégradent ses voisines saines. L'organisme jeune les élimine (immunosurveillance) ; l'organisme âgé les accumule — et c'est corrélé au vieillissement global. Les senolytiques (drogues éliminant ces cellules) améliorent la santé sans toucher aux cellules fonctionnelles.

## 2. Formalisation GenOS
```
Sénescent(C) = vivant ET productif ≈ 0 depuis T ET consommant des ressources ET émettant des effets négatifs
               {verrous tenus, phéromones obsolètes persistantes, alertes répétées sans action}
Détection : score SASP = Σ effets négatifs externes / ressources consommées
Élimination senolytique :
  1. résorption des valeurs (abscission)
  2. archivage fossile
  3. apoptose documentée
Garde-fou : distinguer sénescent (zombie) de dormant utile (spore volontaire, spécialiste rare) — critère d'intention
```

## 3. Mapping primitives existantes
- AMPK/allostasie — mesures de productivité et consommation.
- Abscission/apoptose (`resilience/cellular.rs`) — mécaniques d'élimination existantes.
- Fossiles — archivage préalable.

## 4. Cas d'usage
- Flotte post-projet : dizaines d'agents inactifs tenant des verrous et polluant la stigmergie → campagne senolytique ciblée.
- Détection d'effets négatifs indirects (un agent zombie qui fait échouer les merges des autres).

## 5. Apports attendus
- Hygiène de flotte au-delà du binaire mort/vivant : capture l'état intermédiaire toxique.
- Récupération de ressources ET suppression des externalités négatives.
- Métrique de « santé démographique » de la flotte (% de zombies).

## 6. Points d'intégration
Détecteur `senescent.rs` dans `genos-runtime`, orchestrateur senolytique branché sur abscission/apoptose.
