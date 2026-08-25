# Biomimétisme & Rythmes Circadiens : Chronobiologie des Flottes

> Domaine : chronobiologie — Statut : proposition de recherche

## 1. Fondement biologique
Presque toute la vie suit des horloges circadiennes (~24 h, gènes Clock/Per avec boucles de rétroaction transcription-traduction) et ultradiennes (< 24 h, cycles de 90 min du sommeil). Ces horloges sont **anticipatrices** : elles préparent l'organisme aux phases prévisibles avant qu'elles n'arrivent. La désynchronisation (jet-lag) dégrade massivement les performances.

## 2. Formalisation GenOS
```
Horloge(C) = oscillateur { phase φ ∈ [0,1), période T_circ + harmoniques ultradiennes }
Phases = { Actif(φ ∈ [0.0,0.6)) : exécution pleine ; Crépuscule : consolidation/replay ; Nuit : élagage, sporation, breeding ; Aube : planification }
Couplage : les horloges des capsules d'une flotte se synchronisent mutuellement (coupling faible, pas de maître unique)
```

Les phases pilotent les politiques (budgets AMPK, fenêtres de sommeil synaptique, fenêtres de merge).

## 3. Mapping primitives existantes
- `genos-synaptic/src/forgetting.rs::SleepCycleProcessor` — le « sommeil » devient une phase d'horloge plutôt qu'un événement ad hoc.
- `genos-synaptic/src/ampk.rs` — modulation circadienne du gouverneur énergétique.
- `genos-runtime/src/huddle.rs` — rotation thermique des manchots ↔ rotation par phases.

## 4. Cas d'usage
- Fenêtres nocturnes dédiées au breeding et à la maintenance (zéro contention avec la production).
- Harmonisation des phases pour que les merges se fassent quand toutes les parties ont consolidé.
- Détection de « jet-lag » computationnel : flotte désynchronisée après un incident → resynchronisation forcée.

## 5. Apports attendus
- Prévisibilité opérationnelle : les coûteuses opérations système deviennent planifiées et non plus opportunistes.
- Réduction de la contention entre exploration, production et maintenance.
- Anticipation (l'horloge prépare la phase) alignée avec l'allostasie.

## 6. Points d'intégration
`genos-core/src/circadian.rs` (nouveau), branchement sur `SleepCycleProcessor`, outil MCP `biomimicry_clock_set_phase`.
