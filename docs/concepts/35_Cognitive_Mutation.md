# Mutation Cognitive O(1) & Plasticité Synaptique

Au lieu de faire croître la taille du prompt (historique de messages) de manière exponentielle suite à des erreurs répétées (qui consomment le budget de contexte et réduisent l'attention du LLM), GenOS utilise un mécanisme de **Mutation Cognitive O(1)** soutenu par le crate `genos-synaptic`.

## Principe de la Mutation Cognitive
1. **Évaluation** : Lorsqu'un agent échoue de manière répétée, son comportement est diagnostiqué.
2. **Mutation** : Une nouvelle instruction génomique remplace l'ancienne (par exemple : `mutate_cognition(syntax_strictness=0.99)`).
3. **Complexité O(1)** : L'historique d'échecs est élagué du prompt. Le nouveau génome agit comme une correction intrinsèque immédiate de taille constante, maintenant le prompt compact.

## Architecture : `genos-synaptic`
Ce crate implémente un graphe de plasticité synaptique de type **STDP** (Spike-timing-dependent plasticity). 
- Les traits génomiques et instructions du système forment un réseau neuronal simulé.
- Lorsqu'une instruction conduit à une réussite, son poids "synaptique" est renforcé.
- Les instructions inefficaces voient leur poids s'affaiblir jusqu'à être élaguées.

Ce paradigme biologique garantit une flotte d'agents toujours réactive, sans accumulation de dette cognitive.
