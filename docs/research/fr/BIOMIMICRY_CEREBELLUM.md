> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Cervelet : Procéduralisation des Compétences

> Domaine : neurosciences (motricité apprise) — Statut : proposition de recherche

## 1. Fondement biologique
Le cervelet automatise progressivement les gestes : le vélo, d'abord contrôlé consciemment (cortex, lent, effortful), devient procédural (cervelet, rapide, peu coûteux). La consolidation procédurale se fait par répétition avec correction d'erreur et se poursuit pendant le sommeil. Une compétence procéduralisée libère les ressources corticales.

## 2. Formalisation GenOS
```
Procéduralisation(Tâche t) :
  Prérequis : N exécutions réussies de t avec variance faible et δ_RPE ≈ 0
  Compilation : extraire le programme {préconditions, séquence d'outils, postconditions} des traces rejouées
  Installation : opéron « cérébelleux » = promoteur(t) + gènes de séquence figée
  Garde-fou : monitoring continu ; si taux d'échec > ε, désinstallation et retour voie corticale
```

## 3. Mapping primitives existantes
- `genos-core/src/operon.rs::Operon` — le format opéron accueille les compétences compilées.
- Replay causal (`genos-store`) — source des traces à compiler.
- `docs/research/fr/BIOMIMICRY_GENETICS.md` (« Clonage de Compétences ») — les opérons cérébelleux sont transférables par plasmides (`hgt.rs`).
- Phase de sommeil (`genos-synaptic/src/forgetting.rs`) — moment privilégié de compilation.

## 4. Cas d'usage
- Une tâche de release exécutée 30 fois avec succès devient une compétence réflexe clonable à toute la flotte.
- Dé-procéduralisation quand l'environnement change (les préconditions ne tiennent plus).

## 5. Apports attendus
- Courbe de coût décroissante par tâche répétée (le raisonnement n'est payé qu'à l'apprentissage).
- Diffusion de compétences éprouvées via HGT plutôt que ré-apprentissage.
- Libération du budget MCTS pour les problèmes réellement nouveaux.

## 6. Points d'intégration
`genos-synaptic/src/procedural.rs` (nouveau), outil MCP `memory_proceduralize`, exemple `examples/proceduralization-demo`.
