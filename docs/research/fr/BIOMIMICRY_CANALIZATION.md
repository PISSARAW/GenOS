# Biomimétisme & Canalisation : Robustesse Phénotypique (Waddington)

> Domaine : biologie du développement / génétique quantitative — Statut : proposition de recherche

## 1. Fondement biologique
C.H. Waddington décrit la **canalisation** : certains traits sauvages sont robustes aux perturbations (génétiques ou environnementales), comme une bille roulant dans les vallées d'un « paysage épigénétique ». Un trait canalisé revient à son attracteur malgré le bruit ; la dé-canalisation (exposition au stress) révèle une variance cachée.

## 2. Formalisation GenOS
Mesurer la robustesse d'un trait phénotypique mesuré sous perturbation contrôlée de l'état :

```
Canalisation(T) = 1 − Var(T | perturbations état) / Var_max
Paysage = ensemble des attracteurs {a_k} ; profondeur(a_k) ≈ coût moyen de sortie par perturbation
```

Protocole : fork N mondes (`genos-world`), injecter des perturbations calibrées, mesurer la divergence phénotypique (`genos-core::phenotype::TraitDivergence`).

## 3. Mapping primitives existantes
- `genos-core/src/phenotype.rs::PhenotypeObservation, TraitDivergence` — mesure de dispersion.
- `genos-runtime/` forks + replay causal — génération des contrefactuels.
- `genos-eval/src/qtl.rs` et `variance.rs` (décomposition Vp = Va+Vd+Vi+Ve) — séparer la variance environnementale Ve de la variance génétique.

## 4. Cas d'usage
- Critère de merge : ne promouvoir un fork que si ses traits clés sont canalisés (stables face au bruit du monde).
- Détecter qu'une mutation lamarckienne a dé-canalisé un trait critique (fragilité cachée).

## 5. Apports attendus
- Quantification objective de la stabilité comportementale avant promotion.
- Distinction entre variabilité utile (exploration) et fragilité (instabilité non désirée).
- Complète le H² de `variance.rs` avec une métrique de robustesse développementale.

## 6. Points d'intégration
`genos-eval/src/variance.rs` (nouveau module `canalization.rs`), outil MCP `evolution_measure_canalization`, exemple dédié dans `examples/`.
