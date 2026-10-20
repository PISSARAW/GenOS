# Sélection multisignal des buts GVX

- **Statut** : politique déterministe implémentée ; dispatch et calibration externe requis
- **Portée** : sélection bornée de propositions, pas génération ni exécution autonome
- **Dernière revue** : 2026-10-20
- **Décision** : [ADR 0698](../adr/0698-selection-buts-multisignal-gvx.md)

## Portée implémentée

Le service `backend/src/services/gvxGoalSelector.js` arbitre des propositions
de buts avant leur planification ou leur dispatch. Il complète la détection de
lacunes : il ne remplace ni le planificateur de curriculum, ni un exécuteur,
ni une gate de promotion.

Chaque candidat fournit :

- un `goalId` stable et un `estimatedCost` positif ;
- les signaux `projectNeed`, `trajectoryGap`, `risk`, `opportunity`,
  `uncertainty` et `learningProgress` ;
- pour chaque signal, une valeur dans `[0, 1]` et au moins une `sourceRef` ;
- une provenance avec `candidateRef` et `observedAt`.

Le score additionne les six contributions pondérées et soustrait le coût
normalisé. Les poids par défaut donnent davantage de place au besoin projet,
à l'écart de trajectoire et au risque qu'au seul progrès d'apprentissage. Ils
sont exposés dans `DEFAULT_WEIGHTS` et restent une politique à calibrer, pas un
résultat scientifique.

| Signal | Poids par défaut | Question opératoire |
| --- | ---: | --- |
| `projectNeed` | 0,24 | le projet externe a-t-il un besoin attesté ? |
| `trajectoryGap` | 0,18 | l'état diverge-t-il de l'objectif ? |
| `risk` | 0,18 | l'inaction expose-t-elle une perte ? |
| `opportunity` | 0,12 | une fenêtre utile est-elle ouverte ? |
| `uncertainty` | 0,10 | une expérience réduirait-elle une inconnue importante ? |
| `learningProgress` | 0,08 | le curriculum progresse-t-il encore ? |
| `cost` | 0,10 | quel budget la proposition consomme-t-elle ? |

La faiblesse relative de `learningProgress` est volontaire : l'agent ne doit pas
transformer son propre apprentissage en finalité dominante quand le projet n'en tire
aucun bénéfice.

## Barrières non compensables

Avant le classement, l'adaptateur d'autorité reçoit le but, la portée tenant,
le coût estimé et la permission `goal:propose`. Toute réponse autre que
`true` produit `permission_denied`. Un coût supérieur au budget produit
`budget_exceeded`. Aucun score élevé ne peut compenser ces refus.

Le classement est déterministe : utilité décroissante, coût croissant, puis
identifiant lexical. La sélection respecte `maxCost` et `maxGoals`.

## Option `NO_CHANGE`

`noChangeUtility` représente explicitement l'utilité de ne rien changer. Un
candidat doit la dépasser et atteindre `minUtility`. Si aucun candidat ne
survit aux barrières et à cette comparaison, le reçu contient :

```json
{
  "decision": "NO_CHANGE",
  "status": "no_change",
  "selected": [],
  "noChange": { "utility": 0, "selected": true }
}
```

Les évaluations rejetées restent présentes pour permettre l'audit et la
falsification du choix.

## Frontière d'exécution et de preuve

Une sélection positive produit seulement des hypothèses portant
`execution: requires_external_dispatch` et
`promotion: requires_independent_evidence`. Le reçu global fixe
`autonomousExecution: false` et `promotionAuthorized: false`.

Le sélecteur n'écrit pas dans le registre GVX, ne lance pas un worker et ne
transforme pas une référence de source en preuve vérifiée. L'appelant doit
encore employer les contrats de curriculum, d'autorité, d'exécution et de
promotion appropriés.

## Cas adverses

| Cas | Sortie attendue |
| --- | --- |
| besoin projet nul, progrès d'apprentissage élevé | `NO_CHANGE` si l'utilité ne domine pas |
| permission absente, score maximal | `permission_denied` |
| candidat individuel abordable, budget cumulé dépassé | candidat non retenu |
| mêmes scores et coûts | ordre lexical stable |
| signal sans source | erreur de validation |
| coût supérieur à `maxCost` | `budget_exceeded` |

## Intégration recommandée

1. produire les candidats depuis observations et lacunes ;
2. vérifier et figer les `sourceRefs` ;
3. exécuter `selectGoals` avec un adaptateur d'autorité réel ;
4. persister le reçu et les évaluations rejetées ;
5. transformer les sélections en plans expérimentaux ;
6. repasser par les gates d'exécution et de promotion.

## Vérification locale

```bash
node backend/tests/test_gvx_goal_selector.js
```

Ce test falsifie notamment la domination du progrès d'apprentissage seul, le
contournement des permissions, l'absence de `NO_CHANGE`, le dépassement de
budget, la perte de provenance et l'indéterminisme des égalités.

## Limites

- pondération linéaire sans interactions ni calibration par domaine ;
- estimations de coût fournies par l'appelant ;
- `sourceRefs` présentes mais non résolues par le sélecteur ;
- pas de diversification explicite entre buts corrélés ;
- pas de réservation transactionnelle du budget ;
- pas de preuve comparative avec un curriculum autotelic publié.

Voir [Ontogenèse dirigée par responsabilité](../01-concepts/ontogenese-dirigee-par-responsabilite.md)
et [Évolution contrefactuelle gouvernée](evolution-contrefactuelle-gouvernee.md).
