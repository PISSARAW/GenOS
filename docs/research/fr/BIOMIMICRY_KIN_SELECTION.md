# Biomimétisme & Sélection de Parentèle : Allocation aux Lignées Apparentées

> Domaine : biologie évolutive (Hamilton, r·B > C) — Statut : proposition de recherche

## 1. Fondement biologique
La règle de Hamilton formalise l'altruisme envers les parents : un sacrifice vaut le coup si `r·B > C`, où r est la parenté génétique, B le bénéfice au receveur, C le coût au donneur. La sélection de parentèle explique les sociétés d'insectes eusociaux et protège le patrimoine génétique des lignées éprouvées. À l'inverse, le népotisme excessif mène à la dépression de consanguinité.

## 2. Formalisation GenOS
```
Parenté(A, B) = 1 − distance_génétique_normalisée(Cantor(A.genome, B.genome))   // déjà calculée
Allocation_résiduelle(R) : quand une ressource libre R apparaît,
    candidats = {descendants} triés par (r · valeur_attendue(B, R) − coût_opportunité)
    allocation si score > 0 ; plafond anti-népotisme : ≤ x % des ressources aux parents directs
Garde-fou : consanguinité surveillée (variance génétique populationnelle, cf. population.rs)
```

## 3. Mapping primitives existantes
- `genos-runtime/src/evolution/selection.rs` — la distance Cantor existe déjà.
- `genos-eval/src/population.rs` (Ne, dérive V_t = V(1−1/2Ne)) — surveillance anti-consanguinité.
- Phylogénie (`phylogeny.rs`) — arbre des parentés.

## 4. Cas d'usage
- Un agent validé libère du budget : priorité à ses forks enfants prometteurs plutôt qu'à une répartition aveugle.
- Mission urgente : délégation au descendant le plus proche génétiquement d'un agent expert indisponible (hérite du contexte).

## 5. Apports attendus
- Cohérence des lignées : le patrimoine validé reste dans sa descendance éprouvée.
- Formalisation quantitative (règle de Hamilton) d'une intuition floue (« aider ses petits »).
- Équilibre explicite avec l'anti-consanguinité : altruisme familial sans dérive endogamique.

## 6. Points d'intégration
Extension `selection.rs` (politique d'allocation kin-biased), paramètre de plafond par biotope (`ecosystem.rs`).
