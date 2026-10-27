# Probes des services GenOS pour la condition D

Date : 2026-10-27 (Europe/Paris)  
Révision de départ : `3b92cfb76`  
Statut : **exploratoire; D n'est pas qualifiée**

## E10 — plan morphogénétique

Un probe en mémoire a demandé une cible `rhizome` à
`morphogenesisPlannerService.planMorphogenesis`, avec une topologie courante
`trinity`. Le plan a sélectionné `rhizome` et
`validatePlan({ plan })` a retourné `{ valid: true, errors: [] }`.

Cela valide la génération et la validation du plan seulement. Le probe n'a pas
exécuté de transition, migré l'état de mission, persisté de reçu ni vérifié les
obligations après transition. Il ne qualifie donc pas le critère E10 de
continuité d'une mission pendant un changement de topologie.

## E11 — allocation physiologique

Le probe a appelé l'allocateur de biome GenOS réel
`variantSessionOperations.allocateResources` avec quatre populations de demande
égale, priorités 1, 2, 3 et 4, un budget de 8 et un plancher nul. GenOS a rendu
les budgets respectifs `1, 2, 2, 3` et a conservé le budget total.

L'oracle public E11 actuel applique une règle différente — priorité maximale
avec plafond de quatre unités — qui rend `1, 1, 2, 4` dans ce cas. Cette
différence est une incompatibilité du contrat du benchmark avec le service
GenOS, et non une preuve d'échec de l'allocateur. Comme elle a été observée sur
le corpus public, elle doit être résolue dans une nouvelle révision exploratoire
du protocole avant tout préenregistrement; l'oracle actuel ne doit pas être
réécrit rétroactivement pour faire réussir D.

## Conséquence

Ces probes identifient des travaux concrets pour D : utiliser une frontière de
transition autorisée et persistante pour E10, et définir un oracle E11
indépendant fondé sur les invariants de viabilité, de conservation et d'équité
convenus avant d'observer un holdout. Aucun adaptateur D, résultat de campagne
D ni verdict confirmatoire n'est produit par ces probes.
