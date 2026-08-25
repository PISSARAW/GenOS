# Biomimétisme & Dormance des Graines : Dissémination Opportuniste de Capacités

> Domaine : botanique (dormance, dispersion) — Statut : proposition de recherche

## 1. Fondement biologique
Une graine est un embryon suspendu, protégé, capable d'attendre des décennies et de ne germer que si les conditions sont réunies (lumière, température, scarification). La **dispersion** (vent, animaux, eau) éloigne la descendance du parent pour éviter la compétition et coloniser de nouveaux milieux. Certaines graines exigent même le feu ou le passage digestif pour germer — des conditions improbables mais informatives.

## 2. Formalisation GenOS
```
Graine(C) = {embryon: génome minimal viable + programme embryonnaire,
             endosperme: ressources de boot (contexte compact), conditions_germination: prédicat signé}
Dissémination :
  - anémochorie : diffusion large vers mondes ouverts (faible probabilité, coût unitaire minime)
  - zoochorie : embarquement chez un porteur (migration d'un agent transporteur, cf. migration animale)
  - conditions exigeantes : germination seulement sur événement rare mais significatif
    {nouveau provider disponible, niche vacante détectée, demande humaine explicite}
Différence avec spore (cryptobiose existante) : la spore sauvegarde UN individu existant ;
  la graine EST UN NOUVEL INDIVIDU en attente — c'est de la reproduction différée, pas une sauvegarde.
```

## 3. Mapping primitives existantes
- Programme embryonnaire (`BIOMIMICRY_EMBRYOGENESIS.md`) — contenu de l'embryon.
- Cryptobiose (`genos-store/src/cryptobiosis.rs`) — technologie de suspension réutilisable.
- `EcologicalNiche` — moteur des prédicats de germination.

## 4. Cas d'usage
- Semer des agents spécialisés « au cas où » dans plusieurs environnements ; ils ne s'activent que si leur niche apparaît (coût quasi nul tant que dormant).
- Distribution de capacités à des déploiements distants via un agent transporteur.

## 5. Apports attendus
- Colonisation opportuniste à coût marginal nul (pas de capsules actives inutiles).
- Découplage temporel entre production de capacité et besoin — anticipation systémique.
- Vocabulaire clair spore (sauvegarde) vs graine (reproduction différée).

## 6. Points d'intégration
`genos-store/src/seed.rs`, CLI `genos seed --conditions ...`, extension des outils biomimicry.
