> [!IMPORTANT]
> **Statut Canonique : Implémenté et Validé (GenOS v0.0.1)**
> Ce document de recherche reflète l'architecture exacte du code natif Rust actuel.

# Biomimétisme & Neuromodulation Dopaminergique : Erreur de Prédiction de Récompense

> Domaine : neurosciences (voie mésolimbique) — Statut : proposition de recherche

## 1. Fondement biologique
Les neurones dopaminergiques du tegmentum encodent non pas la récompense, mais l'**erreur de prédiction de récompense** (RPE) : δ = r − V(s). δ > 0 renforce les choix ayant dépassé l'attendu ; δ < 0 pénalise. C'est le socle algorithmique de l'apprentissage par renforcement biologique (même formule que TD-learning) et de la motivation (apathie si dopamine basse).

## 2. Formalisation GenOS
Injecter un signal RPE dans l'évaluation des branches MCTS :

```
δ_branche = fitness_obtenue(branche) − valeur_prédite(branche)
Poids_synaptique(branche) += α · δ · trace_éligibilité
Valeur_prédite mise à jour : V ← V + β·δ   (critique incrémentale)
```

La valeur prédite est stockée comme trait phénotypique appris (état), jamais dans le génome.

## 3. Mapping primitives existantes
- `genos-eval/src/mcts.rs` — remplace/complète le score statique par δ.
- `genos-synaptic/src/graph.rs::SynapticMemoryGraph` — les traces d'éligibilité sont déjà supportées par STDP.
- `genos-core/src/phenotype.rs` — historisation de V pour replay.

## 4. Cas d'usage
- Un fork promu alors que sa performance était *inférieure* aux prévisions reçoit un δ négatif : ajustement immédiat des heuristiques de sélection.
- Détection d'« addiction » : branche surestimée de façon persistante (δ systématiquement négatif malgré poids élevés) → reset du critique.
- Motivation : agents dont δ moyen est nul depuis longtemps = tâches sans signal d'apprentissage → réaffectation.

## 5. Apports attendus
- Apprentissage plus fin que le fitness Pareto statique : distingue « bon résultat » de « meilleur que prévu ».
- Alignement naturel avec le formalisme TD déjà implicite dans MCTS.
- Métrique de santé cognitive par agent (moyenne glissante de |δ|).

## 6. Points d'intégration
`genos-eval/src/rpe.rs` (nouveau module), outil MCP `biomimicry_dopamine_update`, exemple `examples/rpe-demo`.
