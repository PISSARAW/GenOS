# Oracle arithmétique borné et périmètre des missions Trinity

- Statut : accepté
- Date : 2026-11-05

## Contexte

Une réponse de modèle annonçant « résultat obtenu » ne prouve pas une équation.
Le domaine générique des artefacts valide leur forme mais ne permet pas de
qualifier la vérité sémantique de Babel-Gödel. En parallèle, les workers d’une
comparaison Trinity étaient scellés sous la mission racine, alors que leurs
preuves et leur clôture appartiennent à une mission de comparaison distincte.

## Décision

Le domaine `product_power_difference` vérifie précisément la relation entière
`N = (A × B) + C^D − E`. Les cinq prémisses sont bornées et scellées dans le
contrat. Le candidat JSON vient d’un véritable appel modèle avec télémétrie
fournisseur. Les contrôles existants d’artefact, de provenance, d’enveloppe et
de budget restent obligatoires.

Deux processus d’oracle distincts utilisent des stratégies différentes :
arithmétique BigInt avec exponentiation, puis additions répétées pour les
produits et la puissance. Ils vérifient aussi l’identité des prémisses.
Un résultat erroné, un candidat détaché du rapport ou une simple déclaration
de réussite échouent. La vérité externe des axiomes culturels ou scientifiques
n’est pas déduite de cette vérification arithmétique.

Le manifeste d’implémentation inclut les sources de ce domaine et la règle
d’horodatage des observations. Une modification de ces sources change
l’identité du vérificateur et impose une nouvelle qualification réelle.

Trinity scelle désormais les expériences, les runs et leurs cellules sous
la mission de comparaison. Son épisode est créé depuis le tenant réel du
parent. Les budgets et le contexte SYNAPSE restent rattachés au run racine
uniquement après contrôle de la filiation persistée de l’expérience, des
worlds et de leurs appartenances. Le graphe de vérité compile les reçus de la
comparaison ; il ne les réétiquette pas comme preuves de la mission racine.

L’activation ADN est une configuration locale `GENOS_AGENT_DNA=1`. Les
génomes cognitifs importés et sélectionnés restent soumis à la politique de
confiance existante. Aucun génome n’est fabriqué à partir d’un succès de
transport et aucun secret n’est versionné.

## Vérification

Le garage peut remettre un agent à `idle` après son run. La barrière utilise
donc le reçu du run exactement dispatché, et non cet état de disponibilité.
Un état `completed` sans reçu valide ne suffit toujours pas.

La clôture Biome persistante relit son sceau dans la transaction de clôture,
évalue l’homéostasie sur les reçus d’exécution réels, puis ferme les cellules,
l’épisode et la mission via leurs services de transition existants. Une
réponse d’oracle positive sans cette transition ne suffit pas à qualifier la
mission de complètement terminée en base.

La relecture d’un résultat archivé vérifie l’acceptation native, le rapport,
le sujet, l’enveloppe signée et les dates de complétion. Elle ne réautorise
aucune exécution sur une mission terminée. La fraîcheur d’une observation de
run terminé se mesure à sa date de complétion persistée ; un run en cours
continue à utiliser l’horloge courante et un autre propriétaire est refusé.

`test_product_power_difference_oracle.cjs` exécute les deux processus réels et
couvre les fausses valeurs, prémisses étrangères et altérations du candidat.
`test_gqwf_trinity_mission_qualification.js` exige la véritable mission enfant,
la filiation SYNAPSE, le graphe de vérité et les reçus indépendants persistés.
