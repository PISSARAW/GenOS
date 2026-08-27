> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Replay Hippocampique : Consolidation par Rejeu Inversé

> Domaine : neurosciences (hippocampe, consolidation) — Statut : proposition de recherche

## 1. Fondement biologique
Pendant le sommeil lent, l'hippocampe rejoue les séquences vécues — souvent **à l'envers** et à vitesse accélérée (sharp-wave ripples). Ce replay consolide les épisodes vers le cortex néocortical, renforce les trajectoires ayant mené à une récompense et facilite l'extraction de règles générales. Le replay préemptif (rejouer des trajectoires *non encore vécues*) planifie aussi les actions futures.

## 2. Formalisation GenOS
```
SleepReplay(C) :
  Pour chaque épisode e de la fenêtre active, en ordre inverse :
    rejoyer e sur la SynapticMemoryGraph avec amplification STDP (facteur γ > 1)
    si e → succès : renforcer ; si e → échec : renforcer la voie alternative contrefactuelle
  Replay préemptif : simuler les k branches MCTS élaguées pour extraire des généralisations gratuites
Sortie : traits consolidés + candidats-mutations lamarckiennes
```

## 3. Mapping primitives existantes
- `genos-store` event sourcing / DAG causal — source exacte des épisodes à rejouer.
- `genos-synaptic/src/forgetting.rs::SleepCycleProcessor` — hôte naturel du replay (phase « sommeil » existante).
- `genos-synaptic/src/graph.rs::apply_stdp` — mécanisme de renforcement.
- `genos-eval/src/lamarck.rs` — les acquis du replay alimentent les mutations proposées.

## 4. Cas d'usage
- Après une session de forks intensifs, la phase de sommeil consolide ce qui a marché sans consommer de tokens LLM (replay purement local).
- Extraction de patterns récurrents sur des échecs (replay inversé = remonter des causes).

## 5. Apports attendus
- Apprentissage hors-ligne gratuit : le DAG déjà stocké devient matière première pédagogique.
- Meilleure consolidation que le simple élagage actuel : on renforce avant d'élaguer.
- Alimentation automatique du pipeline lamarckien existant.

## 6. Points d'intégration
Extension de `genos-synaptic/src/forgetting.rs` (module `replay.rs`), outil MCP `memory_sleep_replay`.
