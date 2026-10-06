# ADR 0328 - Laboratoire qualité-diversité et évolution bornée

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Domaine** : morphogenèse, GVX, évaluation expérimentale
- **Décideurs** : équipe GenOS
- **Lié à** : [Évaluation des variantes A-Team](0309-evaluation-isolee-variants-a-team.md)

## Contexte

La morphogenèse peut choisir entre plusieurs organisations, mais une meilleure
note sur les missions utilisées pour la sélection ne démontre pas un gain
sur de nouvelles missions. L'évolution de code ajoute un risque si le candidat
peut modifier l'évaluateur ou les règles de promotion.

## Décision

Un laboratoire isolé archive les organisations mesurées avec Pyribs, selon
leur nombre de workers et leur part de vérification. Les scores utilisent les
résultats rapportés par mission, le coût en tokens et la latence, à budget et
échéance comparables. Un jeu séparé mesure le choix retenu après la sélection.

La tâche ShinkaEvolve ne fait évoluer que trois poids numériques dont la somme
vaut un. L'évaluateur lit ces valeurs par l'arbre syntaxique sans exécuter le
fichier candidat ; toute autre instruction est refusée. Il ne lit que les
missions d'apprentissage et écrit les fichiers de résultat attendus par
ShinkaEvolve. Le lanceur est borné à dix générations et un travail de
proposition et d'évaluation simultané. Il exige un modèle explicite pour
lancer une évolution.

Le laboratoire n'accorde aucune promotion GVX. Les exemples livrés sont
synthétiques et servent uniquement à tester le protocole. Les campagnes
réelles doivent fournir des reçus indépendants, un jeu tenu à l'écart et
des budgets appariés.

## Conséquences

### Positives

- Plusieurs organisations restent visibles dans l'archive, même si l'une a
  le meilleur score d'apprentissage.
- Le rapport expose le score de validation séparément et laisse la promotion
  à la chaîne de preuve existante.
- Le candidat Shinka ne peut pas exécuter du code par l'évaluateur.

### Négatives

- Le laboratoire Python dépend de Pyribs et de ShinkaEvolve, hors runtime.
- Le lanceur de modèle n'a pas été exécuté dans ce lot ; aucune amélioration
  empirique de GenOS n'est revendiquée.
- Les reçus des jeux réels doivent être vérifiés par une autre couche.

## Alternatives

- Garder seulement le meilleur candidat d'apprentissage : perte de diversité
  et risque de surapprentissage.
- Laisser évoluer librement le runtime ou l'évaluateur : la mesure ne serait
  plus indépendante du candidat.