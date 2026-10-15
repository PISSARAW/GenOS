# Négociation morphogénétique des besoins de groupes

`groupResourceNegotiation.arbitrateGroupNeeds(input)` est une primitive pure pour comparer les besoins de plusieurs groupes. Chaque offre indique une dépense mesurable (`requestedTokens`, `minimumTokens`), un gain marginal borné entre 0 et 1, un niveau de confiance et des références de preuve. Le classement déterministe utilise `gain × confiance / jetons demandés`; une offre n'est financée que si son seuil minimal est atteint. Le reliquat peut rester inutilisé si aucune demande restante n'atteint son minimum.

Un groupe endormi ne revient dans l'arbitrage que si son signal de réveil dépasse le seuil configuré et contient au moins une référence de preuve. Les groupes actifs sans besoin finançable passent en sommeil avec une raison explicite. L'arbitrage retourne allocations et états; il ne lance ni worker, ni daemon, ni changement de gouvernance.

Les actions de transfert et spawn sont plafonnées globalement par la policy et par un maximum dur de cinq de chaque type. La re-gouvernance ne s'applique qu'aux groupes financés et reste bornée au nombre de groupes. Le spawn et la re-gouvernance portent `pending_authority` quand l'autorité nécessaire n'est pas présente. Le consommateur doit encore valider les permissions, le budget et la preuve avant toute exécution. L'API est actuellement une primitive appelable; son raccord au cycle des époques reste à faire.

Voir l'[ADR 0543](../adr/0543-negociation-marginale-des-groupes.md) et le test déterministe `backend/tests/test_morphogenesis_group_negotiation.js`.
