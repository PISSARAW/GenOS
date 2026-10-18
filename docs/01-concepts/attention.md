# Attention

- **Statut** : Implémenté (fonctionnel)
- **Portée** : fovéation, active sensing, pont thalamique, leases + bancs causaux et sondes — corrélation observée, pas preuve introspective.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

L'attention est le mécanisme par lequel un système sélectionne une subset d'informations pour un traitement approfondi, tout en filtrant le reste. Dans GenOS, l'attention désigne les services qui évaluent la validité du champ attentionnel et la fidélité des rapports.

## 2. Modèle mathématique ou logique

Les services d'attention produisent des scores de validité et de fidélité bornés dans $[0,1]$. Une sonde jugée retourne un verdict structuré avec sa limitation. Aucun score n'établit une attention consciente.

## 3. Analogies biologiques et limites réelles

L'attention sélective et le foveal processing sont des mécanismes biologiques. Dans GenOS, ils sont des politiques logicielles : leases, bancs causaux, sondes. L'analogie est structurelle, pas homologique.

## 4. Cas d'usage et objectifs métier

- Vérifier qu'un agent focalise son attention sur les éléments pertinents avant une décision.
- Détecter une perte de fidélité des rapports (hallucination potentielle).
- Alimenter le rappel autobiographique avec un instantané d'audit attentionnel.

## 5. Exemples concrets

- `attentionSchemaBenchService` évalue la validité du champ attentionnel.
- `attentionProbeService` juge les sondes d'attention.
- Le pont thalamique (`genos_biomimicry_thalamic_bridge`) partage un plan d'attention entre agents jumeaux.

## 6. Schéma ou diagramme

```text
[Entrées sensorielles / contextuelles]
           ↓
[Sélection attentive (leases, bancs causaux)]
           ↓
[Sondes jugées + fidélité des rapports]
           ↓
[Score de validité + limitation explicite]
```

## 7. Architecture technique

Fichiers : `backend/src/services/attentionSchemaBenchService.js`, `backend/src/services/attentionProbeService.js`. Le pont thalamique est dans `backend/src/services/mcpBioTools/handlers/thalamicBridge.js`.

Le concept `cognition.attention` est enregistré avec le service `attentionSchemaBenchService`, niveau `implemented`.

## 8. Processus d'exécution ou de validation

Tests de cohérence Rust/Node : `test_rust_node_coherence.js`. Tests du pont thalamique : `test_thalamic_bridge.js`. Les suites vérifient les contrats logiciels, pas le câblage de production.

## 9. Comparaison avec le marché

Les frameworks d'agents n'ont généralement pas de mécanisme d'attention évaluable avec sondes jugées. GenOS expose des scores de validité et de fidélité avec limitations déclarées.

## 10. Limites, garde-fous, non-objectifs

- L'attention fonctionnelle n'est pas une attention consciente.
- La validité du champ est une corrélation observée, pas une preuve introspective.
- Le steering live (contrôle en temps réel de l'attention) manque encore.
- Non-objectif : modéliser l'attention phénoménale.

## Voir aussi

- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — ligne "Attention sélective".
- [neurobiologie-et-plasticite.md](../01-concepts/neurobiologie-et-plasticite.md) — pont thalamique.
- [attentionSchemaBenchService.js](../../backend/src/services/attentionSchemaBenchService.js) — implémentation.
