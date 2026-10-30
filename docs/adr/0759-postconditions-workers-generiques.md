# ADR 0759 — Postconditions scellées des workers génériques

- Statut : accepté
- Date : 2026-10-30

## Contexte

Le worker local générique n'a pas de méthode native. Son dossier pouvait atteindre
un oracle d'artefact natif qui exigeait cette méthode, puis échouer avec
`ORACLE_DOMAIN_UNAVAILABLE`. Valider seulement le format ou la présence de sources
ne permet pas de transformer ce dossier en preuve sémantique.

## Décision

Une affectation peut déclarer `workspaceVerificationContract`, version 1 :
opération bornée, chemins relatifs et empreintes des sources, colonnes et unités.
Ce contrat est scellé dans le génome du run avant la génération. Sa présence ne
transforme pas le worker en exécuteur déterministe : le modèle produit le candidat.

L'oracle `workspace_claims` charge les sources dans le workspace autorisé, refuse
les liens, sorties de périmètre et changements d'entrées immuables. Deux processus
isolés recomputent les postconditions suivant deux stratégies, dans le budget
existant. Le quorum, les signatures, nonces, références d'exécution et contrôles
de fraîcheur restent obligatoires. Le code des nouvelles vérifications entre
dans le manifeste des implémentations de vérificateurs.

Les patches sont relus dans leur état courant. Le noyau palindrome interprète
uniquement un sous-langage Python pur et explicite sur les entrées ASCII ; il
n'exécute pas le code arbitraire du candidat. Une vérification symbolique et une
énumération indépendante contrôlent ce domaine. Une syntaxe hors de ce domaine
reste inconclusive. Les reçus de tests exécutés restent exigés par la barrière
de code existante.

## Conséquences et limites

Une réponse fausse est réfutée, un contrat absent ou une entrée non prise en charge
reste refusé ou inconclusif. La qualité artistique nécessite une revue humaine :
les contraintes formelles seules ne qualifient ni un poème ni le dossier qui
l'inclut. Le contrôle de données médicales est limité à des données synthétiques
et interdit diagnostic et traitement.

## Alternatives

Accepter le dossier typé seul affaiblirait les gates. Injecter une méthode native
pour fabriquer le résultat ne mesurerait plus Qwen. Ces deux options sont rejetées.

## Vérification

`test_workspace_oracle_checks.js` couvre résultats justes, faux, entrées hostiles,
contrats substitués et limites humaines. `test_workspace_oracle_runtime.js`
traverse le vrai dispatch, le transport modèle de test et les deux processus
d'oracle ; le mauvais résultat conserve un reçu non vérifié.
