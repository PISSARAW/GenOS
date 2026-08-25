# Dormance des Graines — Rétention Conditionnelle

> **Concept** : Les plantes emballent leur patrimoine dans une graine hyper-résistante qui attend que les conditions environnementales (eau, température) soient favorables pour germer.
> **Statut** : implémenté (genos-core::biomimicry::seed_dormancy)

## Bénéfice
Quand un agent se rend compte que son environnement d'exécution est hostile (par exemple, rate limits épuisés, ou CPU overload sur la machine hôte), il ne plante pas. Il utilise iomimicry_plant_seed pour se "compresser" (sérialisation de tout son état DAG et contexte). Il reste en hibernation dans la base de données (graineterie) jusqu'à ce que les conditions soient à nouveau favorables, reprenant exactement là où il s'est arrêté.
