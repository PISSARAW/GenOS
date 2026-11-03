# ADR 0774 — Application LLM par expressions symboliques

**Statut** : Accepté
**Date** : 2026-11-03
**Domaine** : Ontogenèse, application de règles, qualification LLM
**Lié à** : [ADR 0771](0771-filiation-verifiee-et-regles-apprises-validees.md), [Harness LLM](../../benchmarks/identity-llm/README.md)

## Contexte

La campagne V2 complète passe les critères d'identité, avec 298/300 chemins et
relations corrects, dix sondes de descendants et trois sondes à froid entièrement
correctes. Le vérificateur confirme les huit règles admises. L'application brute
reste pourtant à 26/96, contre 0/96 pour les deux contrôles. Les trois fenêtres
restent entre 25 % et 28,125 %, sous le seuil inchangé de 80 %.

Les premières variantes de développement avec traces détaillées régressent :
3/32 contre 7/32 pour les colonnes décimales, puis 1/32 contre 8/32 pour les sommes
et assemblages en listes. Le modèle recopie parfois une entrée dans tous les
postes ou ferme une liste après un terme ; des assemblages atteignent la limite
inchangée de 2 048 tokens. Une structure JSON plus détaillée ne garantit pas une
exécution sémantique correcte. Ces pilotes négatifs restent conservés sur D:.

## Décision

Le plan fournit la valeur littérale et ses caractères dans l'ordre original.
Cette segmentation est réversible. Les règles récupérées sont uniquement celles
nommées dans le problème courant. Les autres connaissances restent dans la mémoire
durable ; elles ne distraient plus l'application présente.

Le runtime compile ces règles en une expression symbolique **non évaluée**.
Une règle affine émet les coefficients, l'entrée et les parenthèses de l'expression
arithmétique. Une règle textuelle émet les appels `join`, `reverse`, `upper` et
`concat` correspondant aux paramètres appris. Les compositions emboîtent ces
expressions. Un opérateur manquant propage une expression inconnue.

Le compilateur produit seulement du texte de programme. Il n'exécute aucune
addition, multiplication, inversion, casse ou concaténation de résultat. Les
littéraux numériques proviennent uniquement des entrées et règles ; les caractères
initiaux gardent leur ordre d'origine. Aucun oracle, résultat attendu ou proposition
de réparation n'entre dans cette compilation.

Les instructions d'évaluation sont courtes et propres à la famille. Le LLM évalue
l'expression et retourne sa réponse et sa confiance. La dérivation des paramètres
depuis le feedback reste structurée dans les tours d'apprentissage. Les portes
d'admission, de rejet et de révocation ne changent pas.

Les schémas laissent la réponse libre. À famille identique, modifier entrées et
règles ne contraint pas la génération au résultat attendu. Le score utilise la
réponse brute du modèle, sans calculatrice, substitution, sélection par oracle,
nouvelle tentative ou correction après réception. Tous les contrôles utilisent
la même compilation avec leur propre mémoire, y compris les règles permutées.

## Validation et portée

Les tests vérifient la réversibilité de la vue littérale, l'absence de règles
inutilisées dans le prompt, la conservation des littéraux dans le programme, la
liberté des réponses et la persistance des erreurs brutes au score. Le vérificateur
reconstruit la sélection et la compilation depuis la mémoire relue ; il ne fait pas
confiance au programme journalisé seul.

Les comparaisons de développement avec définitions fournies testent seulement
l'application et ne prouvent pas un apprentissage. Les essais négatifs et les
échecs techniques sont conservés dans des dossiers distincts.

Après commit et gel des sources, une nouvelle graine alimente la campagne complète.
Les 300 transformations, 970 appels principaux, corpus, contrôles, poids, seuils et
budgets restent identiques, dont 256 tokens de raisonnement et 2 048 de sortie.
Le vérificateur et les trois sondes à froid restent obligatoires.

Le périmètre concerne un agent GenOS avec mémoire externe, récupération ciblée et
compilation symbolique. Il ne qualifie pas un LLM sans ces services. La correction
reste une hypothèse expérimentale jusqu'au résultat complet ; aucune promotion
de production n'est autorisée par ce changement.

## Alternatives

- Calculer les résultats nativement ou injecter l'oracle dans la grammaire : ne mesurerait plus l'application demandée au LLM.
- Remplacer une réponse par un intermédiaire correct : masquerait une erreur brute.
- Accumuler les traces de travail : les variantes négatives montrent leurs limites avec ce modèle et ce budget.
- Augmenter le budget ou changer de modèle après les résultats : empêcherait cette comparaison à protocole constant.
