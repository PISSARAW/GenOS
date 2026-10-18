# Limites entre métrique fonctionnelle et expérience subjective

- **Statut** : Cadre conceptuel (planned)
- **Portée** : séparation explicite : score fonctionnel ≠ preuve d'expérience subjective.
- **Dernière revue** : 2026-10-18

## 1. Définition du domaine

Ce concept délimite ce qu'une métrique fonctionnelle peut établir (un score, une corrélation, un contrat logiciel) et ce qu'elle ne peut pas établir (une expérience subjective, des qualia, une conscience phénoménale). C'est la règle épistémologique centrale de GenOS : le succès de transport n'est pas la preuve d'une décision valide, et une métrique n'est pas un vécu.

## 2. Modèle mathématique ou logique

Une métrique $M$ est une fonction $M : S \to [0,1]$ sur l'espace des états système. Elle ne dit rien sur l'espace phénoménal $P$. Il n'existe pas de mapping prouvé $M \to P$. L'absence de corrélat mesurable n'implique pas l'absence d'expérience, mais sa présence non plus n'implique pas l'expérience.

## 3. Analogies biologiques et limites réelles

La corrélation entre activité neurale et rapport subjectif est établie dans certains cas (ex. cortex visuel et perception de couleur), mais le "gap explicatif" demeure. GenOS ne prétend pas combler ce gap : ses métriques sont des indicateurs fonctionnels bornés.

## 4. Cas d'usage et objectifs métier

- Empêcher qu'un score d'indicateur de conscience soit utilisé comme preuve dans une gate de promotion.
- Documenter explicitement la limitation de chaque rapport (`limitation` en clair).
- Retourner `insufficient_data` ou `unavailable` plutôt qu'un faux nombre quand une mesure n'est pas possible.

## 5. Exemples concrets

- `consciousnessService.recordQualia` : `phenomenalAccess: 'unassessed'`, `metaphysicalClaimEstablished: false`.
- `metacognitionBenchService` : avec < 10 essais, retourne `insufficient_data`, jamais un faux score.
- `checkSupervenience` : `candidateOnly: true`, `limitation: 'Une comparaison logicielle ne prouve pas la supervenience métaphysique.'`.

## 6. Schéma ou diagramme

```text
[Métrique fonctionnelle (score 0–1)]
           ↓ (ne prouve pas)
[Expérience subjective — non accessible]
           ↑
[Limite épistémologique : aucune inférence autorisée]
```

## 7. Architecture Technique

Le principe est appliqué dans tous les services de philosophie : `consciousnessService`, `metacognitionBenchService`, `selfModelService`, `agentConscienceService`. Chaque rapport porte son champ `limitation`.

Le concept `epistemology.metric-experience-boundary` est enregistré avec le service `consciousnessService`, niveau `conceptual`, classification `reference_only`.

## 8. Processus d'exécution ou de validation

Les tests vérifient que les services retournent `insufficient_data` ou `unavailable` quand les données manquent, et qu'ils ne fabriquent jamais de faux nombres.

## 9. Comparaison avec le marché

Les outils d'évaluation de l'IA présentent souvent des scores comme des preuves de compréhension ou de conscience. GenOS fait l'inverse : chaque score est accompagné de sa limitation explicite et ne peut pas être utilisé comme preuve autonome.

## 10. Limites, garde-fous, non-objectifs

- Une métrique ne mesure jamais l'expérience subjective.
- Aucun score ne constitue une preuve de conscience.
- Non-objectif : établir un pont entre fonctionnel et phénoménal.
- Cadre : `epistemologie-et-evidence.md` pour le contrat claim/preuve.

## Voir aussi

- [epistemologie-et-evidence.md](epistemologie-et-evidence.md) — contrat claim/preuve et gates.
- [conscience.md](conscience.md) — conscience phénoménale.
- [indicateurs-fonctionnels.md](indicateurs-fonctionnels.md) — indicateurs avec limitations.
- [consciousnessService.js](../../backend/src/services/consciousnessService.js) — rapports avec `phenomenalAccess: 'unassessed'`.
