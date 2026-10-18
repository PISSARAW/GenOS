# Perception

- **Statut** : Partiel
- **Portée** : bridge perception-mémoire via `perceptionMemoryBridgeService` ; observation canonique, pas perception sensorielle.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

La perception est la prise d'information de l'environnement et sa transformation en représentation interne. Dans GenOS, la perception désigne l'acquisition d'observations canoniques (crops fovéaux, captures web, états d'environnement) et leur mise à disposition pour le raisonnement de l'agent.

## 2. Modèle mathématique ou logique

Une observation canonique est un tuple (source, type, contenu, timestamp, confiance). Le bridge construit cette observation et l'ajoute au sensorium de l'agent. Un événement `PERCEPTION_OBSERVED` est émis.

## 3. Analogies biologiques et limites réelles

La perception biologique implique des récepteurs sensoriels et un traitement corticale. GenOS n'a pas de capteurs physiques : les "perceptions" sont des données transmises par des outils ou des API. L'analogie est limitée.

## 4. Cas d'usage et objectifs métier

- Capturer une observation avant une décision (ex. crop fovéal d'une page web).
- Rendre l'observation rappelable avant une mission suivante via la mémoire autobiographique.
- Marquer l'observation comme historique non fiable, à vérifier dans le contexte courant.

## 5. Exemples concrets

- `perceptionMemoryBridgeService` construit une observation canonique à partir des résultats de `genos_browser_act`, `genos_foveal_crop`, `genos_optimal_foraging`, `genos_computer_use`.
- L'observation est ajoutée au sensorium de l'agent et émet `PERCEPTION_OBSERVED`.
- Le résumé de rappel est injecté dans le prompt sous `GENOS AUTOBIOGRAPHICAL RECALL`.

## 6. Schéma ou diagramme

```text
[Outil (crop, browsing, foraging)]
           ↓
[perceptionMemoryBridgeService : observation canonique]
           ↓
[Sensorium de l'agent + PERCEPTION_OBSERVED]
           ↓
[Mémoire autobiographique : épisode perception]
           ↓
[Rappel avant mission suivante (historique non fiable)]
```

## 7. Architecture technique

Le service autonome vit dans
`backend/src/services/perception/perceptionMemoryBridgeService.js`. Il est appelé
par `backend/src/services/mcpExecutor/efferenceBridge.js` après la réussite d'un
outil de perception autorisé, puis alimente le sensorium et la capture
autobiographique via l'événement `PERCEPTION_OBSERVED`.

Le concept `cognition.perception` est enregistré avec le service `perceptionMemoryBridgeService`, niveau `partial`.

## 8. Processus d'exécution ou de validation

Les résultats des outils de perception passent par le bridge et sont évalués pour saillance. Les tests de mémoire autobiographique couvrent partiellement ce parcours.

## 9. Comparaison avec le marché

Les frameworks d'agents avec usage d'ordinateur (computer use) capturent des écrans. GenOS ajoute une observation canonique structurée et une intégration à la mémoire autobiographique, mais sans perception sensorielle.

## 10. Limites, garde-fous, non-objectifs

- Pas de perception sensorielle : seulement des données d'outils.
- L'observation est marquée historique non fiable.
- Plusieurs voies d'action ne sont pas couvertes par le registre des effecteurs.
- Non-objectif : modéliser la perception phénoménale.

## Voir aussi

- [memoire-autobiographique.md](../02-orchestration/memoire-autobiographique.md) — capture et perception.
- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — ligne "Perception".
- [effectorRegistry.json](../../shared/effectorRegistry.json) — voies d'action.
