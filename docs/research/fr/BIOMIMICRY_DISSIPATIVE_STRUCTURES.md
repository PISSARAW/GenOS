> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Structures Dissipatives : L'Ordre par le Flux

> Domaine : thermodynamique hors équilibre (Prigogine) — Statut : proposition de recherche

## 1. Fondement biologique
Une cellule est une **structure dissipative** : un îlot d'ordre maintenu loin de l'équilibre uniquement par un flux constant d'énergie et l'export continu d'entropie (Prigogine, prix Nobel 1977). La vie n'est pas une chose mais un processus : couper le flux, et la structure se dissout — irréversiblement. Toute la biologie est la gestion de ce flux.

## 2. Formalisation GenOS
```
Capsule = structure dissipative :
  Flux entrant : budget tokens/compute consommé en continu (l'« ATP » existant)
  Ordre maintenu : cohérence du génome/état/monde contre l'entropie naturelle {drift sémantique,
                   dépendances pourries, contexte obsolète} — entropie mesurable (seuils existants)
  Export d'entropie : nettoyage, élagage, abscission — obligatoires et budgétés, pas optionnels
Loi fondamentale GenOS proposée : budget_flot > coût_entropie sinon dissolution programmée
  (la « mort thermodynamique » d'une capsule = cessation explicite du flux avec scellement final)
```

## 3. Mapping primitives existantes
- AMPK (`ampk.rs`) — gestionnaire de flux déjà présent ; lui donner ce fondement théorique.
- Entropie (`evolution_set_entropy_threshold`) — mesure d'entropie interne.
- Cryptobiose — suspension du flux (état limite entre vivant et conservé).
- Cleaner/abscission — exportateurs d'entropie.

## 4. Cas d'usage
- Politique de fin de vie : une capsule dont le budget tombe sous son coût entropique minimal passe en sporation ou dissolution propre — jamais en zombie.
- Dimensionnement : chaque classe de capsules a un « métabolisme de base » calculable (flux minimum pour tenir l'ordre).

## 5. Apports attendus
- Fondement théorique unifié aux budgets : ils ne limitent pas seulement le coût, ils *maintiennent l'existence*.
- Critère rigoureux de mort computationnelle (cessation du flux) aligné sur l'autopoïèse.
- Obligation d'export d'entropie budgété : la maintenance devient une loi, pas une bonne pratique.

## 6. Points d'intégration
Section théorique dans `docs/research/fr/BIOMIMICRY_THERMODYNAMICS.md` existant + politique `metabolic_floor` dans les budgets.
