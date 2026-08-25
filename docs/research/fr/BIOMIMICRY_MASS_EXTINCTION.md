# Biomimétisme & Extinction de Masse : Purges Contrôlées et Ré-Émission Fossile

> Domaine : paléontologie / macroécologie — Statut : proposition de recherche

## 1. Fondement biologique
Les Big Five extinctions ont éliminé > 75 % des espèces mais ouvert les radiations suivantes (mammifères post-KTg). Après chaque extinction suit une **récupération** : lacunes écologiques comblées par des survivants opportunistes puis par radiation depuis les lignées refuges. La biologie distingue extinction de fond (continue, faible) et extinctions massives (catastrophiques, sélectives).

## 2. Formalisation GenOS
```
Extinction_de_fond : purge continue automatique des lignées sous seuil de fitness depuis T générations (déjà implicite)
Extinction_de_masse(D, critère K) :
  Déclencheur : décision humaine ou condition systémique (dette technique, obsolescence d'un modèle)
  Sélectivité : K épargne les refuges (fossiles validés, spores, lignées mutualistes contractuelles)
  Exécution : apoptose massive documentée ; archivage complet avant destruction (CAS immuable)
Récupération :
  Phase 1 : survivants opportunistes (pionniers, succession écologique)
  Phase 2 : radiation adaptative depuis les refuges fossiles (ré-émission depuis `FossilRegistry`)
```

## 3. Mapping primitives existantes
- `genos-store/src/fossil.rs::FossilRegistry` — les refuges existent déjà.
- Cryptobiose (`cryptobiosis.rs`) — mise en spore pré-extinction pour les lignées à préserver sans exécution.
- `resilience/cellular.rs::trigger_apoptosis` — mécanique individuelle déjà présente ; il manque l'orchestrateur de masse.

## 4. Cas d'usage
- Décommissionner proprement toute une génération d'agents obsolètes après changement de stack, en conservant les preuves et la possibilité de ré-émission.
- Reset périodique d'un domaine envahi par des lignées dégénérées.

## 5. Apports attendus
- Nettoyage radical avec **garantie de réversibilité** via fossiles/spores (rien n'est perdu définitivement).
- Discipline : la purge suit un critère K auditable, pas une frustration ponctuelle.
- Cycle créateur documenté : chaque extinction prépare sa radiation.

## 6. Points d'intégration
Orchestrateur `genos-runtime/src/evolution/extinction.rs`, CLI `genos evolution extinct --criteria K`, doc gabarit resilience.
