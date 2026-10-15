# Négociation morphogénétique des besoins de groupes

`groupResourceNegotiation.arbitrateGroupNeeds(input)` compare les besoins de plusieurs groupes. Chaque offre indique une dépense mesurable (`requestedTokens`, `minimumTokens`), un gain marginal borné entre 0 et 1, un niveau de confiance et des références de preuve. Le classement déterministe utilise `gain × confiance / jetons demandés`; une offre n'est financée que si son seuil minimal est atteint. Le reliquat peut rester inutilisé si aucune demande restante n'atteint son minimum.

Un groupe endormi ne revient dans l'arbitrage que si son signal de réveil dépasse le seuil configuré et contient au moins une référence de preuve. Les groupes actifs sans besoin finançable passent en sommeil avec une raison explicite. L'arbitrage retourne allocations et états; il ne lance ni worker, ni daemon, ni changement de gouvernance.

Les actions de transfert et spawn sont plafonnées globalement par la policy et par un maximum dur de cinq de chaque type. La re-gouvernance ne s'applique qu'aux groupes financés et reste bornée au nombre de groupes. Le spawn et la re-gouvernance portent `pending_authority` quand l'autorité nécessaire n'est pas présente.

Le cycle morphogénétique peut proposer ce plan comme candidate `RESOURCE_REALLOCATION`.
Pour devenir disponible au sélecteur, chaque besoin financé doit aussi contenir un
`proofDigest` et un reçu indépendant signé lié à ce digest et à une référence de preuve.
Une liste `evidenceRefs` seule est insuffisante. L'empreinte candidate couvre le plan
financé exact et ne peut utiliser que ses issues indépendantes calibrées. L'effet de
budget exige en plus une admission de stratégie et le même `transitionId` dans le reçu;
ce reçu consigne les tokens réellement affectés. Sans ces conditions, `NO_CHANGE`
conserve la répartition standard. Les propositions de transfert, spawn et gouvernance
ne confèrent aucune autorité d'exécution.

Le runtime ne produit actuellement pas de reçus indépendants pour les `resourceNeeds`;
la candidate reste donc indisponible en production tant qu'un producteur et un flux
d'issues vérifiées exactes ne sont pas raccordés.

Voir l'[ADR 0543](../adr/0543-negociation-marginale-des-groupes.md) et le test déterministe `backend/tests/test_morphogenesis_group_negotiation.js`.
