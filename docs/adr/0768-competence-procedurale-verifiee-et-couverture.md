# ADR 0768 — Procédures apprises vérifiées et abstention par couverture

- **Date** : 2026-11-02
- **Statut** : accepté pour un module interne borné au domaine affine.

## Contexte

La campagne competence-100 v1 a produit 13/120 réponses correctes et 24/40
réponses à haute confiance sur des questions sous-déterminées. Le rappel était
correct, mais les prompts après cent épisodes étaient identiques à ceux après
douze. Le banc n'activait ni consolidation procédurale ni calibration apprise.
Les sondes ont aussi montré des échecs de calcul avec des règles explicites.

## Décision

Ajouter `experienceCompetence` comme module interne, sans nouvel endpoint ou
outil autorisé. Le LLM propose une règle affine ; seules des observations liées
à l'agent et au run, signées par un vérificateur explicitement reconnu, peuvent
alimenter l'apprentissage. Une procédure doit satisfaire toutes les observations
sur au moins trois entrées distinctes et passer la consolidation GenOS existante.
Le service ne déduit pas lui-même les coefficients depuis l'oracle.

Conserver chaque observation dans l'état adaptatif durable. Revalider les preuves
au chargement, lier les procédures à leurs observations et retirer une procédure
contredite. Exécuter les programmes admis par un interpréteur entier borné, sans
évaluation de texte généré ni accès arbitraire aux outils ou au système de fichiers.

Vérifier la couverture de toutes les primitives avant d'exécuter. Une lacune
entraîne une abstention structurelle. Produire une prévision depuis le support
observé, la figer avant exécution avec le service métacognitif existant et la
résoudre à partir d'une issue indépendante signée. Utiliser la calibration mesurée
pour ajuster le plancher de décision, sans rendre aucun gate plus permissif.

Évaluer cette architecture dans un banc v2 distinct et un corpus réservé neuf.
Conserver les seuils primaires v1 et les données négatives. Publier séparément
sortie brute du modèle et réponse de l'agent assisté d'un outil de calcul.

## Conséquences

### Complément — hypothèses hybrides et retour d'erreur

Le prototype v2 limite l'induction aux propositions du LLM. Sur ses données
d'entraînement, celui-ci n'admet que deux procédures sur quatre malgré des
observations suffisantes. Cette exécution reste conservée séparément.

Le module hybride ajoute donc une recherche affine bornée depuis les seules
paires d'entraînement signées. Elle produit un candidat, vérifié et consolidé
par les mêmes portes que ceux du modèle. Chaque procédure indique la provenance
`model` ou `bounded_affine_synthesis` ; aucune sortie d'outil n'est attribuée au LLM.
Le retour d'erreur montre aussi au modèle ses propositions rejetées et un
contre-exemple vérifié. Les points d'ancrage sont sélectionnés dans les données
observées ; toutes les observations restent utilisées pour l'admission.

La v3 effectue cent appels LLM d'apprentissage puis évalue les procédures figées
dans les trois états, sans appels LLM décoratifs pendant les 480 évaluations.
Le protocole distingue donc explicitement appels de modèle et exécutions d'outil.
La synthèse bornée peut apprendre cette famille sans LLM : aucune supériorité
causale du LLM seul ne sera déduite de ce test hybride.

La compétence mesurée appartient à un agent outillé avec apprentissage externe.
Elle n'atteste pas une modification des poids du modèle ni une compétence générale.
Le domaine affine connu à l'avance limite l'inférence ; aucune généralisation à
des procédures arbitraires n'est autorisée par ce module. Les reçus locaux ne sont
pas des attestations d'un laboratoire tiers. Aucun mécanisme de promotion du
runtime n'est modifié ou contourné.

## Alternatives

- Augmenter le nombre d'exemples rappelés : insuffisant pour le calcul et le veto
  sur connaissances manquantes ; les observations tardives doivent affecter l'état.
- Faire confiance au score déclaré par le LLM : rejeté par les erreurs confiantes.
- Fournir les coefficients de l'oracle à l'agent : rejeté, contamination de la preuve.
- Confondre synthèse bornée et raisonnement du LLM : rejeté ; les deux sources
  doivent être tracées et leurs limites explicites dans l'évaluation hybride.
