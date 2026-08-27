> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Équilibres Ponctués : Sortie des Plateaux Évolutifs

> Domaine : biologie évolutive (Eldredge & Gould) — Statut : proposition de recherche

## 1. Fondement biologique
Le registre fossile montre des **stases** longues (millions d'années de stabilité morphologique) entrecoupées de sauts rapides (géologiquement parlant), souvent corrélés aux événements de spéciation dans les petites populations périphériques. L'évolution n'est pas graduelle : c'est ponctué. La stase n'est pas une absence d'évolution mais un équilibre stabilisé par la canalisation et la sélection normalisante.

## 2. Formalisation GenOS
```
Détection de stase : fitness médiane de la population ∈ plateau depuis T_stase générations
                     ET variance phénotypique stable ET pas d'amélioration Pareto
Réponse graduée :
  Niveau 1 : relâcher la sélection normalisante (augmenter ε d'acceptation)
  Niveau 2 : macro-mutation dirigée (SOS existant + ciblage QTL des traits plafonnés)
  Niveau 3 : événement de spéciation forcée (petite population isolée = périmètre évolutif rapide)
Retour à la stabilité dès reprise de progression Pareto.
```

## 3. Mapping primitives existantes
- `genos-eval/src/pareto.rs` — détecteur de plateau naturel.
- `genos-core/src/sos.rs` (réponse SOS, polymérase error-prone) — mécanisme de saut déjà présent, mais déclenché par stress ; ici déclenché par stagnation.
- `forces.rs` (goulets, migration) — outil du niveau 3.
- `qtl.rs` — identification des loci responsables du plafonnement.

## 4. Cas d'usage
- Une flotte optimisée ne progresse plus depuis 200 générations sur le benchmark cible : déclenchement automatique d'une campagne de macro-mutations sur les gènes corrélés (QTL) au trait bloqué.

## 5. Apports attendus
- Sortie systématique des optimums locaux, au lieu de plateaux subis.
- Cadre théorique qui justifie *quand* dépenser massivement du budget d'exploration (économie de recherche).
- Historique évolutif lisible en phases (stase/stase/saut) plutôt qu'en bruit continu.

## 6. Points d'intégration
`genos-eval/src/punctuated.rs` (nouveau module d'orchestration), hooks sur pareto/sos/forces.
