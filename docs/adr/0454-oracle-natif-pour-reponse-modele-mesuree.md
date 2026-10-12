# ADR 0454 — Oracle natif pour une réponse modèle mesurée

## Statut

Accepté pour le parcours borné `model_subset_sum`.

## Contexte

L'agent pouvait enregistrer une tentative modèle mesurée et son coût dans un reçu worker. Le seul oracle `subset_sum` existant vérifiait toutefois un calcul natif, exécuté sans tokens de modèle. Ce reçu ne pouvait donc pas qualifier une réussite du modèle pour l'apprentissage du routeur.

## Décision

Le contrat de méthode `model_subset_sum` désigne un domaine oracle distinct. Une action modèle active et attestée doit enregistrer, dans cet ordre, le début du run, l'usage fournisseur mesuré et un rapport contenant les octets UTF-8 bruts de la réponse. Le rapport lie la réponse au run, à l'action et à la tentative par une empreinte SHA-256. La sortie est limitée à 16 Kio. Le sujet oracle reconstruit la liaison à partir des observations scellées et du journal des tentatives, avec contrôle de tenant, d'acteur, de statut et de consommation.

Deux processus natifs distincts analysent le JSON de la réponse et recalculent les postconditions `subset_sum` avec les stratégies `subset_bitset` et `subset_enumeration`. Leurs reçus passent par le registre de confiance et l'assemblage AEIS existants. L'acceptation reste soumise aux mêmes limites de durée, de nombre de processus, d'indépendance, de fraîcheur et de scellement que les autres domaines natifs. Le pont vers le routeur exige ensuite le reçu worker, le contrat de mission, l'action active et la tentative mesurée correspondante. L'ingestion reste explicite.

La continuité OpenAI est fournie par son contrat explicite `openai-responses`. Le quota de l'action garde une part pour les tokens d'entrée avant de fixer le maximum de sortie. Si l'estimation réelle dépasse la réserve, le routeur refuse l'appel.

## Conséquences

Une réponse exacte peut produire une preuve positive complète et une observation qualifiée du routeur. Un JSON erroné, une empreinte divergente, une tentative sans usage fournisseur ou une liaison action/run incohérente ne qualifient pas la mission. Le test d'intégration utilise un fournisseur de test qui renvoie une réponse et des compteurs mesurés ; il ne démontre pas la qualité d'un fournisseur externe. La méthode reste limitée à `subset_sum` et aux sorties brèves.
