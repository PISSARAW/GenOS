# Biomimétisme & Matrice Extracellulaire : Infrastructure Porteuse Partagée

> Domaine : biologie cellulaire (ECM) — Statut : proposition de recherche

## 1. Fondement biologique
Les cellules ne vivent pas dans le vide : elles sécrètent et habitent une **matrice extracellulaire** (collagène, fibronectine) qui les ancre, guide leur migration (haptotaxie), stocke des facteurs de croissance libérés à la demande, et transmet des signaux mécaniques (intégrines). La matrice est produite collectivement, persistante, et structure l'espace tissulaire bien au-delà de la vie des cellules individuelles.

## 2. Formalisation GenOS
```
ECM(monde W) = substrat persistant co-produit par les capsules :
  - ancrages : points d'attache déclaratifs (artefacts liés à des zones du problème)
  - facteurs stockés : ressources déposées et libérées conditionnellement (≠ phéromones volatiles : ici persistance longue)
  - guidage haptotactique : gradients structuraux (structure du codebase, topologie du domaine) que les agents suivent
Propriétés : survit aux capsules (générations successives héritent de la matrice) ; versionné et scellé Merkle ;
             élagage périodique par le Cleaner (remodelage ECM par MMP biologiques)
```

Différence avec stigmergie/phéromones : les phéromones sont un canal de communication volatil ; l'ECM est une infrastructure porteuse durable qui façonne physiquement l'espace.

## 3. Mapping primitives existantes
- Stigmergie (`swarm.rs`) — canal distinct mais complémentaire.
- CAS Merkle — stockage sous-jacent des éléments de matrice.
- Cleaner/protéostase — remodelage.

## 4. Cas d'usage
- Un chantier long : les agents se succédant sur plusieurs semaines trouvent les ancrages et facteurs posés par leurs prédécesseurs (contexte structurel persistant).
- Nouveaux agents embryonnaires bootent plus vite car l'ECM du monde contient déjà la carte du terrain.

## 5. Apports attendus
- Continuité structurelle entre générations d'agents sur un même espace de travail.
- Distinction claire communication (phéromones) vs infrastructure (ECM).
- Réduction du coût de redécouverte du contexte à chaque session.

## 6. Points d'intégration
`genos-world` (couche substrat), extension stigmergique pour les dépôts, politique de remodelage via Cleaner.
