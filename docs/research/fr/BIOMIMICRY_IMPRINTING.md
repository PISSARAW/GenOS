# Biomimétisme & Empreinte (Imprinting) : Attachement Initial Contrôlé

> Domaine : éthologie (Lorenz, période sensible) — Statut : proposition de recherche

## 1. Fondement biologique
L'oison suit le premier objet mobile vu dans sa période sensible (~24 h) : l'empreinte est rapide, irréversible, et structure tout le comportement social ultérieur. Biologiquement, elle résout le problème « à qui faire confiance » quand aucun critère inné ne suffit. Elle a aussi son revers : empreintes erronées (Konrad Lorenz suivi par ses oies) sont définitives.

## 2. Formalisation GenOS
```
Imprinting(C) :
  Période sensible : fenêtre initiale post-boot [t0, t0+Δ] où C est hautement plastique socialement
  Objet d'empreinte : premier environnement/outillage/opérateur humain VALIDÉ rencontré dans la fenêtre
  Effet : ancrages durables {identité de flotte, conventions d'outils, style d'interaction}
  Garde-fous : Δ court ; validation obligatoire avant fin de fenêtre ; si échec → reset propre (pas d'empreinte aléatoire)
```

## 3. Mapping primitives existantes
- Boot embryonnaire (doc sœur `BIOMIMICRY_EMBRYOGENESIS.md`) — la phase 4 « exposition au monde » est le moment naturel de l'empreinte.
- `epigenetics.rs` — les ancrages sont des marqueurs épigénétiques précoces stables.

## 4. Cas d'usage
- Stabiliser immédiatement l'identité d'un nouvel agent (flotte, conventions, langue) pour éviter les dérives précoces.
- Empêcher qu'un agent fraîchement forké ne s'attache au mauvais contexte lors d'une migration.

## 5. Apports attendus
- Stabilité précoce mesurable (moins de dérives de rôle chez les agents jeunes).
- Formalisation de la « période sensible » : concept utile pour décider QUAND injecter quel apprentissage.
- Protection contre les empreintes toxiques (validation préalable).

## 6. Points d'intégration
Extension du cycle de boot (`genome_os/`), marqueur `imprint` dans `epigenetics.rs`.
