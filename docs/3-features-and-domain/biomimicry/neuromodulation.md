# Neuromodulation Dopaminergique — Reward Prediction Error

> **Concept biologique** : Neuromodulation dopaminergique — Les neurones dopaminergiques ne récompensent pas simplement un succès, ils encodent l'Erreur de Prédiction de Récompense (RPE). Une surprise positive crée un pic (renforcement), une surprise négative crée un creux (dépression).
> **Statut** : implémenté (`genos-core::biomimicry::neuromodulation`)
> **Recherche amont** : `docs/research/fr/BIOMIMICRY_NEUROMODULATION.md`

## 1. Pourquoi

### 1.1 Le problème : UCB1 est trop lent
Dans l'algorithme MCTS classique (Monte Carlo Tree Search), l'exploration/exploitation (formule UCB1) met beaucoup de temps à s'adapter si une branche soudainement se révèle incroyablement bonne. Elle doit lentement faire monter sa moyenne.

La biologie (cerveau des mammifères) utilise des *spikes* de dopamine lors d'une découverte inattendue (Eurêka) pour court-circuiter l'exploration mathématique lente et verrouiller l'attention sur cette voie (Long-Term Potentiation).

### 1.2 Bénéfices
| Bénéfice | Mécanisme |
|---|---|
| **Apprentissage ultra-rapide** | Si un rollout donne 0.9 alors qu'on attendait 0.2, le pic de dopamine force le planificateur à explorer cette branche immédiatement. |
| **Dépression des voies sans issue** | Si une branche "prometteuse" (0.8) donne 0.1, le "dopamine dip" pénalise agressivement la branche. |

## 2. Comment

Le `DopaminergicSystem` calcule le RPE :
`RPE = Actual Reward - Expected Reward`
`Dopamine = Baseline + (RPE * Learning Rate)`

Si le niveau de dopamine dépasse un seuil (ex: 1.5x la baseline), la branche est déclarée `PriorityPathway`.

## 3. Quand — orchestrateur vs worker

| Acteur | Responsabilité |
|---|---|
| **Orchestrateur (Planner)** | Lors de la phase de *Backpropagation* du MCTS, l'orchestrateur calcule le RPE pour le nœud courant. S'il y a un *Dopamine Spike*, le nœud reçoit un bonus artificiel écrasant le calcul UCB1 standard. |
| **Worker** | Exécute les rollouts sans se soucier de la dopamine. |

## 4. API

### 4.1 CLI
```bash
# Une surprise très positive !
genos biomimicry bio-feature --feature neuromodulation --action rpe \
  --param node_id=node_alpha \
  --param expected_reward=0.2 \
  --param actual_reward=0.9
# Sortie: DOPAMINE SPIKE! Pathway reinforced for priority exploration.
```
