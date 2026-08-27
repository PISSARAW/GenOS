> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Cascades de Signalisation : Amplification Contrôlée des Signaux Faibles

> Domaine : biologie cellulaire (voie MAPK, transduction) — Statut : proposition de recherche

## 1. Fondement biologique
Une seule molécule d'hormone peut mobiliser des millions de molécules effectrices : les cascades de phosphorylation (MAPK) amplifient exponentiellement le signal, avec spécificité garantie par des échafaudages (scaffolds) et désactivation par phosphatases. La cellule détecte ainsi des signaux quasi imperceptibles sans devenir paranoïaque — grâce à l'amplification *conditionnelle*.

## 2. Formalisation GenOS
```
Cascade(s, niveau_0) :
  Étage i : si intensité(s) > θ_i alors action_i ET s → amplifié vers étage i+1
  θ croissant ; actions de plus en plus lourdes {journaliser → alerter voisinage → inflammation → quarantaine}
Scaffold : contexte liant les étages (une cascade par classe d'événements — pas de mélange)
Phosphatase : décroissance active entre étages (fenêtre temporelle courte) pour éviter l'amortissement permanent
Métrique clé : gain total = action_max / signal_initial, borné par conception
```

## 3. Mapping primitives existantes
- Interférons, inflammation, nociception (`resilience/`) — déjà des *actions* d'étages, sans orchestration graduée.
- Seuils AMPK/hystérésis — patron de seuillage réutilisable.
- Alarmes typées — classification en amont des cascades.

## 4. Cas d'usage
- Une anomalie mineure répétée escalade automatiquement : 3 occurrences → alerte locale ; 30 → interférons ; 300 → inflammation contrôlée.
- Détection d'un signal faible mais structurant (pattern émergent d'usage) : amplification jusqu'au niveau décisionnel humain.

## 5. Apports attendus
- Sensibilité aux signaux faibles sans explosion de faux positifs (seuils progressifs + fenêtres courtes).
- Graduation automatique de la réponse — finie par construction.
- Réutilisation unifiée des mécanismes défensifs existants en escaliers cohérents.

## 6. Points d'intégration
`genos-core/src/resilience/cascade.rs`, branchement des modules resilience existants comme effecteurs.
