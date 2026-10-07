# ADR 0354 — Oracle sémantique natif et sujet runtime scellé

- **Statut** : Accepté
- **Date** : 2026-10-07
- **Domaine** : Oracles, postconditions, AEIS, P1 L03

## Contexte

Un calcul natif produit un reçu de contenu, mais une signature ou une nouvelle
exécution du même solveur ne suffisent pas à vérifier sa signification. Le
gate terminal exige des preuves indépendantes et une assemblée AEIS. Une
sonde du prédicat de receipt seul accepte une signature valide pour un autre
résultat datée de 2000 ; elle ne teste pas le gate complet AEIS.

## Décision

Le registre AEIS expose l'adaptateur `procedure_semantic`. Son sujet est lu
côté service dans les bindings GVX et biologiques existants, avec le tenant,
le propriétaire du run, le contrat et l'observation appliquée. Aucun candidat
ne fournit les entrées faisant autorité ni la commande de vérification.
Le FormalResult doit désigner exactement ce sujet, son digest, une assertion
canonique sur les postconditions et son domaine. Une preuve pour un autre
claim ou des entrées changées est refusée avant lancement.

Deux algorithmes distincts contrôlent subset sum : un bitset d'entiers et une
énumération exhaustive des sous-ensembles. Ils n'importent pas le solveur
producteur à base de Map. Ils vérifient existence ou absence, indices
distincts dans les entrées, somme du témoin et nombre de sommes atteignables.
L'énumération est limitée à vingt valeurs ; le bitset à mille valeurs et deux
millions de cellules de recherche. Hors domaine, le verdict reste
`inconclusive` avec une raison explicite.

Chaque vérification utilise le binaire Node courant, une entrée de programme
fixée et un workspace temporaire frais. Seul JSON passe par stdin. Les
variables d'environnement et `NODE_OPTIONS` du parent ne sont pas transmis,
à l'exception de `SystemRoot` sur Windows. Entrées, sortie, temps et nombre de
processus par appel sont bornés. Les répertoires propres sont supprimés après
attente de fermeture du processus.

L'indépendance est calculée avant signature dans le bridge AEIS existant.
Pour ce type, acteur, algorithme, runtime, workspace et contexte proviennent
de l'exécution observée. Changer des labels fournis ne transforme pas deux
exécutions du même algorithme en stratégies indépendantes. La stratégie
déclarée doit contenir exactement un identifiant enregistré. Les commandes
de tests ou d'artefacts candidates ne remplacent pas cet adaptateur.

Le receipt signé conserve les empreintes des bindings et de l'observation,
le run, le processus, l'algorithme, son domaine et les temps observés. Le
manifest de confiance inclut ces sources et leurs dépendances d'intégrité.
L'observation doit dater de moins de dix minutes ; une nouvelle lecture
après le processus vérifie que le sujet reste identique et frais.

## Vérification et limites

La sonde traverse le run natif réel de délégation, les bindings SQLite, deux
processus, la signature AEIS et son assemblée d'assurance. Les résultats
altérés, mauvais scopes, absence de sujet et vieillissement de l'horloge sont
refusés. Les contrôles de faux témoins, faux négatifs et comptes erronés
traversent aussi les processus. Un budget d'énumération dépassé reste
explicitement inconclusif. Une option Node héritée invalide ne perturbe pas
le lancement de l'oracle.

La production de ces preuves ne réécrit ni ne promeut le run historique
bloqué. Le raccordement à la clôture des runs et à leurs manifestes reste à
terminer avec nonce, fraîcheur et budget de vérification au point de décision.
Les oracles code et mémoire ainsi que les autres domaines de raisonnement
restent ouverts. Deux algorithmes ne suppriment pas les dépendances communes
au runtime Node ou à la spécification. Le workspace frais et l'environnement
réduit ne constituent pas un confinement OS. Aucun gain scientifique général
ni fermeture de L03 n'est revendiqué.
