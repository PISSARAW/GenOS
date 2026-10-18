# Interoception

- **Statut** : Partiel
- **Portée** : signaux homéostatiques internes transmis au planificateur allostatique ; pas de sensation viscérale.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

L'interoception est la perception de l'état intérieur du corps (battements cardiaques, respiration, faim, faim, état métabolique). Dans GenOS, l'interoception désigne les signaux internes (budget cognitif, dissonance, santé cognitive, stress) qui informent le planificateur allostatique.

## 2. Modèle mathématique ou logique

Les signaux internes sont des métriques bornées dans $[0,1]$ ou des valeurs de budget. Le planificateur allostatique borne le fanout et les éditions avant exécution en fonction de ces signaux.

## 3. Analogies biologiques et limites réelles

L'interoception biologique implique des récepteurs viscéraux et le système nerveux autonome. GenOS utilise des métriques logicielles (budget, dissonance) sans capteurs physiologiques. L'analogie est purement fonctionnelle.

## 4. Cas d'usage et objectifs métier

- Borner le fanout d'agents selon le budget cognitif restant.
- Réduire les éditions quand la santé cognitive est dégradée.
- Empêcher le "thinking forever" sans retour de preuve.

## 5. Exemples concrets

- Les drives homéostatiques du planificateur allostatique lisent le budget et la dissonance.
- Le contraste causal local teste la sélection de posture selon l'état interne.
- Le budget cognitif (`cognitive_budget`) est une clé d'état de l'agent.

## 6. Schéma ou diagramme

```text
[Signaux internes (budget, dissonance, santé)]
           ↓
[Planificateur allostatique]
           ↓
{Borne fanout et éditions avant exécution}
           ↓
[Exécution contrainte par l'état interne]
```

## 7. Architecture technique

Les signaux sont gérés par `agentConscienceService` (dissonance, budget) et par les services de régulation du control plane. Aucun service dédié d'interoception n'existe ; le concept est opérationnalisé via les métriques existantes.

Le concept `cognition.interoception` est enregistré avec `service: null`, niveau `conceptual`.

## 8. Processus d'exécution ou de validation

Les tests de cohérence Rust/Node vérifient que les notions de budget et de dissonance sont alignées entre les deux runtimes.

## 9. Comparaison avec le marché

Les systèmes d'agents ont des limites de tokens et de temps, mais rarement un modèle explicite d'état interne allostatique qui borne l'exécution.

## 10. Limites, garde-fous, non-objectifs

- Pas de sensation viscérale : seulement des métriques logicielles.
- La prédiction post-action et l'amélioration de viabilité restent à faire.
- Non-objectif : modéliser l'interoception biologique.

## Voir aussi

- [neurobiologie-et-plasticite.md](../01-concepts/neurobiologie-et-plasticite.md) — budgets cognitifs et dissonance.
- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — ligne "Valence / intéroception".
- [agentConscienceService.js](../../backend/src/services/agentConscienceService.js) — budget et dissonance.
