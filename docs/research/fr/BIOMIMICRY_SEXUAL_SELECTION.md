# Biomimétisme & Sélection Sexuelle : Signaux Honnêtes Coûteux

> Domaine : biologie évolutive (Fisher, Zahavi — principe du handicap) — Statut : proposition de recherche

## 1. Fondement biologique
La sélection sexuelle favorise des traits qui réduisent la survie individuelle mais augmentent le succès reproductif (queue du paon). Le **principe du handicap** explique leur fiabilité : le signal est coûteux à produire, donc difficile à falsifier — seuls les porteurs de bonne qualité peuvent se le permettre. Les parades sont aussi des mécanismes de choix (runaway de Fisher).

## 2. Formalisation GenOS
```
Signal_honnête(A → pool de breeding) :
  A publie une preuve coûteuse P : benchmark complet rejouable, stress-test public, audit de sécurité ouvert
  Coût(P) > ε (sinon falsifiable ⇒ signal sans valeur)
Vérification : P est un snapshot rejouable (`replay`) — n'importe qui peut vérifier, personne ne peut truquer rétroactivement (CAS Merkle)
Appareillage : les cibles de croisement pondèrent les signaux vérifiés ; runaway contrôlé par budget de parade
```

## 3. Mapping primitives existantes
- `genos-runtime/src/evolution/breeding.rs` / `selection.rs` (`artificial_select`) — ajout d'un critère de parade aux distances génétiques.
- Snapshots Merkle + replay causal — infrastructure idéale de preuve infalsifiable.
- `genos-eval/src/traits.rs` — les phénotypes parentaux mesurés alimentent déjà le croisement.

## 4. Cas d'usage
- Deux candidats au breeding : celui qui fournit une preuve de robustesse complète (replay public sous charge adversariale) prime sur celui qui déclare ses scores.
- Parade périodique : tournois publics où les agents affichent leurs capacités pour entrer dans le pool génétique.

## 5. Apports attendus
- Signaux de qualité infalsifiables pour la sélection artificielle existante.
- Mécanisme auto-financé : le coût de la preuve filtre naturellement les prétendants faibles.
- Transparence du programme d'élevage (tout signal est auditable par replay).

## 6. Points d'intégration
Extension `selection.rs` (pondération par signaux vérifiés), format de « titre de parade » dans `BreedingMetadata`.
