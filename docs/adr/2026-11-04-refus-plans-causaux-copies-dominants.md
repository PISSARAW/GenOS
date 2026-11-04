# Refuser les copies causales dominantes avant la rédaction des scènes

- **Statut** : Implémenté et vérifié localement ; effet sur le modèle réel à mesurer.
- **Dernière revue** : 2026-11-04.

## Contexte

Une relance du Dernier Sas a produit sept scènes dont les champs `decision`,
`consequence` et `stateAfter` étaient identiques. Chaque scène prévoyait le même
sacrifice et la même fermeture du sas. Les identifiants et en-têtes distincts
suffisaient au validateur structurel. Un défaut de rythme rendait ensuite le plan
provisoire ; la permission de rédiger du texte inerte ne le qualifiait pas, mais
transmettait cette répétition au générateur de scènes.

## Décision

`validatePlanStructure` refuse un groupe d’au moins trois tuples causaux copiés
lorsqu’il représente une majorité stricte des scènes. Le tuple est formé des
trois champs précités, normalisés en Unicode NFKC, en minuscules et avec espaces
regroupés. Aucun texte du plan n’est modifié. Les différences de conséquence ou
d’état final restent des différences ; aucun jugement de similarité sémantique
n’est substitué à cette comparaison mécanique.

Le refus porte le code existant `GQEL_PLAN_INVALID` et un diagnostic
`PLAN_CAUSAL_REPETITION`. Celui-ci conserve les identifiants concernés, la
proportion, le digest canonique du plan et celui du tuple. Trois citations
littérales, bornées à 240 points de code chacune, renvoient aux champs originaux
avec leurs digests complets. Ce sont des extraits diagnostiques ; aucun fragment
de scénario n’est ainsi accepté ou réparé.

La réparation emploie exclusivement la boucle protocolaire existante, son
invoker mesuré et `maxProtocolRepairs`. Les diagnostics et la réponse entière
non fiable sont conservés dans les tentatives et transmis à la nouvelle requête.
Pour `narrative_plan`, la consigne permet explicitement de réparer les transitions
de la sortie proposée, sans modifier le brief, la grille ni les gates.

## Conséquences et vérification

Le refus intervient avant l’évaluation du plan et avant la permission de
rédaction provisoire. Après épuisement, aucune scène n’est rédigée et les tours
de plan ou d’artefact ne multiplient pas cette réparation protocolaire.
La garde ne force aucun statut de réussite ni événement narratif.

`backend/tests/test_gqel_plan_repetition.cjs` vérifie les seuils, les variantes
de casse/espaces/Unicode, les citations et digests, le comptage des appels,
une réparation synthétique complète, les refus de budget et d’usage inconnus,
et l’absence de rédaction provisoire après épuisement. Une option de test lit
le plan réel archivé comme preuve négative sans le recopier dans le dépôt.
Les réponses synthétiques ne prouvent aucune amélioration artistique.

Deux reprises, ou trois copies sans majorité stricte, restent autorisées.
Les paraphrases, boucles causales plus complexes et routines intentionnelles
ne sont pas jugées par cette garde ; les critères sémantiques finaux restent
applicables. Une majorité de tuples littéralement identiques devra être
réécrite même si elle correspond à une intention stylistique.

## Alternatives

- Réécrire automatiquement les conséquences : rejeté, car le runtime inventerait
  le contenu de l’auteur.
- Faire seulement un défaut provisoire : rejeté pour cette duplication mécanique,
  car le même plan serait encore transmis aux scènes après épuisement local.
- Refuser toute paire identique : rejeté pour conserver les reprises limitées.
- Ajouter des tentatives sans plafond : rejeté ; les budgets existants suffisent
  à borner l’échec comme la réparation.
