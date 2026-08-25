# Replay Hippocampique — Consolidation Hors-Ligne

> **Concept** : Rejouer les expériences de la journée pendant le sommeil (ondes lentes) pour transformer la mémoire épisodique à court terme en mémoire sémantique/procédurale à long terme.
> **Statut** : implémenté (genos-core::biomimicry::hippocampal_replay)

## Bénéfice
Les agents GenOS génèrent d'énormes DAG causaux de leurs actions. En phase *Nocturne*, le replay filtre les DAG ayant un haut success_score et les compile en *macros* généralisées, économisant des tokens pour les exécutions futures.
