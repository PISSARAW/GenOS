# Biomimétisme & Dégénérescence : Redondance Hétérogène Anti-Fragile

> Domaine : neurosciences évolutives (Edelman, Gally) — Statut : proposition de recherche

## 1. Fondement biologique
Le cerveau est **dégénéré** au sens technique : des structures différentes produisent la même fonction (plusieurs circuits peuvent générer le même mouvement). À distinguer de la redondance simple (copies identiques) : la dégénérescence fait que les solutions varient — donc leurs modes de défaillance aussi. Résultat : le système perd graduellement en performance, jamais brutalement ; et la variation résiduelle nourrit l'évolution.

## 2. Formalisation GenOS
```
Dégénérescence(fonction F) = ensemble {impl_1..impl_k} tel que :
  - chaque impl_i satisfait F (validé par les gates)
  - structures hétérogènes : distance génétique(impl_i, impl_j) > δ (pas des clones)
Politique de déploiement critique :
  - répartir la charge sur implémentations dégénérées plutôt que clones mitotiques identiques
  - corrélation de défaillance faible par construction → fiabilité du service ≈ 1 − Π p_i
Métrique : degré de dégénérescence d'un service = k × diversité moyenne
```

## 3. Mapping primitives existantes
- Mitose contrôlée (clones, doc sœur) — l'alternative homogène à éviter pour les fonctions critiques.
- Breeding/phylogénie — génération naturelle de solutions hétérogènes équifonctionnelles.
- Gates/Pareto — validation que chaque implémentation satisfait F.

## 4. Cas d'usage
- Un service critique porté par 5 agents issus de lignées différentes mais validés sur la même fonction : aucune panne commune ne les touche tous.
- Post-mortem : quand une implémentation échoue, les autres continuent ET fournissent des données comparatives précieuses.

## 5. Apports attendus
- Fiabilité supérieure à la réplication identique (anti-correlated failures).
- Fondement théorique pour choisir entre cloner (coût, rapidité) et dégénérer (robustesse).
- La population d'agents devient un actif de fiabilité, pas seulement de capacité.

## 6. Points d'intégration
Politique de déploiement dans `genos-runtime`, métrique de diversité dans `genos-eval/src/population.rs`.
