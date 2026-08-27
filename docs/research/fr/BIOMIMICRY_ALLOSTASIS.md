> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Allostasie : Anticipation de la Charge Future

> Domaine : physiologie du stress (McEwen) — Statut : proposition de recherche

## 1. Fondement biologique
L'homéostasie maintient un point fixe ; l'**allostasie** maintient la stabilité *par le changement*, en anticipant les demandes futures. L'organisme prépare cortisol/glucose AVANT l'effort prévu. La **charge allostatique** est l'usure cumulée de ces adaptations : un stress répété sans récupération use l'organisme même si chaque réponse individuelle est correcte.

## 2. Formalisation GenOS
```
Allostasie(C) :
  Charge_prévue(t+Δ) = estimation depuis le calendrier des missions + tendances de trafic
  Préparation : budgets ajustés AVANT la montée (pré-échelle des pools de capsules, pré-compilation de contexte)
Charge_allostatique(C) = Σ (coût_adaptation_i · absence_récupération_i)
  si charge > seuil : intervention obligatoire (repos forcé, sporation partielle, refus de nouvelles missions)
```

Différence avec AMPK existant (réactif, mesure présente) : l'allostasie est **prospective** et cumulative.

## 3. Mapping primitives existantes
- `genos-synaptic/src/ampk.rs::AmpkAutomaton` — l'allostasie s'ajoute comme couche de pilotage amont de l'AMPK.
- `Capsule = ⟨Génome, State, World, EventHistory, Budget⟩` — le budget devient une fonction anticipatrice.
- Historiques d'événements (`genos-store`) — base statistique des tendances.

## 4. Cas d'usage
- Deadline connue vendredi : montée en puissance progressive dès mercredi (spawn de clones mitotiques), retour à l'équilibre programmé samedi (récupération).
- Détection d'agents en surrégime chronique avant dégradation de qualité (la charge allostatique monte avant les échecs).

## 5. Apports attendus
- Passage de la gestion réactive à la gestion prédictive des ressources.
- Métrique inédite d'« usure opérationnelle » corrélable aux pannes futures (validation QTL possible).
- Protection de la qualité : un agent chargé allostatiquement voit sa fiabilité chuter avant de casser.

## 6. Points d'intégration
Extension `genos-synaptic/src/ampk.rs` (module `allostasis.rs`), outil MCP `biomimicry_allostatic_plan`.
