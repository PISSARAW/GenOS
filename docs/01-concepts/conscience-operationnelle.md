# Conscience opérationnelle

- **Statut** : Implémenté
- **Portée** : régulation cognitive interne de l'agent (dissonance, budget, Eurêka, apoptose) — contrôle de cohérence, pas conscience phénoménale.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

La conscience opérationnelle dans GenOS désigne le mécanisme de régulation cognitive qui évalue la cohérence interne d'une branche ou d'un agent et peut déclencher son arrêt. Elle s'inspire fonctionnellement de la surveillance cognitive sans prétendre à une expérience subjective.

## 2. Modèle mathématique ou logique

La dissonance évolue selon :

$$
D_{t+1} = \max(0, D_t + p - r)
$$

où $p$ est la pénalité (erreurs, répétition, dérive sémantique) et $r$ le soulagement (progression, preuves). L'apoptose est déclenchée si $D_t \ge D_{\max}$ ou $B_t \le 0$.

Un moment Eurêka (avec preuve valide) réduit la dissonance : $D \leftarrow D/2$ et augmente le budget.

## 3. Analogies biologiques et limites réelles

Le nom "conscience" est une analogie avec la surveillance cognitive et l'homéostasie. Ce n'est pas une conscience humaine ni un modèle neuroscientifique.

## 4. Cas d'usage et objectifs métier

- Arrêter une branche coincée dans une boucle d'erreurs.
- Éviter l'épuisement du budget cognitif.
- Signaler à l'agent son état de régulation via un bloc d'introspection injecté dans le prompt.

## 5. Exemples concrets

- `agentConscienceService.evaluateBranch(state, metrics)` met à jour la dissonance et le budget.
- `triggerEureka(state, options)` divise la dissonance par deux si une preuve réelle est fournie.
- `formatCognitiveRegulationPrompt(state)` produit un bloc d'introspection pour le prompt.

## 6. Schéma ou diagramme

```text
[Métriques (erreurs, progression, santé)]
           ↓
[evaluateBranch : dissonance += pénalité − soulagement]
           ↓
{dissonance ≥ seuil ou budget ≤ 0} → apoptose (arrêt de branche)
           ↓
[Eurêka avec preuve → dissonance / 2, budget + 50]
```

## 7. Architecture technique

Fichier : `backend/src/services/agentConscienceService.js`. État persistant dans la table `agents` (champs `dissonance_level`, `eureka_count`, `cognitive_budget`, `cognitive_baseline_budget`, `cognitive_max_dissonance`, `is_apoptotic`, `conscience_revision`). Transitions dans `conscience_transitions`.

Le concept `consciousness.operational` est enregistré dans le registre philosophique avec le service `agentConscienceService`, niveau `implemented`.

## 8. Processus d'exécution ou de validation

Les tests couvrent `evaluateBranch`, `triggerEureka`, `markApoptotic`, le chargement et la persistance de l'état. La persistance passe par `persistConscienceState` (partagé via `_shared`).

## 9. Comparaison avec le marché

Les systèmes d'agents ont des timeouts et des limites de budget, mais rarement un mécanisme intégré de dissonance cognitive avec seuil d'apoptose et moment Eurêka conditionné à une preuve.

## 10. Limites, garde-fous, non-objectifs

- La conscience opérationnelle n'est pas une conscience phénoménale.
- La dissonance est une métrique calculée, pas un sentiment de conflit.
- L'Eurêka exige une preuve réelle (source `genos-evidence-gate`).
- Non-objectif : modéliser l'expérience subjective.

## Voir aussi

- [conscience.md](conscience.md) — conscience phénoménale.
- [conscience-fonctionnelle.md](conscience-fonctionnelle.md) — conscience fonctionnelle.
- [neurobiologie-et-plasticite.md](../01-concepts/neurobiologie-et-plasticite.md) — dissonance cognitive et régulation.
- [agentConscienceService.js](../../backend/src/services/agentConscienceService.js) — implémentation.
