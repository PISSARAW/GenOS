# ADR 0543 — Arbitrage marginal des besoins entre groupes

- **Statut :** proposé
- **Date :** 2026-10-15
- **Décision :** fournir un arbitre morphogénétique pur qui compare les offres mesurables des groupes sous un budget partagé, produit des états sommeil/réveil et prépare des propositions bornées de transfert, spawn et re-gouvernance.

## Contexte

Les adaptations d'une flotte ne doivent pas répartir les jetons uniformément ni confondre consensus local et valeur pour la mission. Les groupes doivent formuler des besoins avec un coût, un gain marginal, une confiance et des références de preuve. Les changements d'effectif ou de gouvernance ne sont pas autorisés par le seul fait qu'un arbitrage les recommande.

## Décision

`backend/src/services/morphogenesis/groupResourceNegotiation.js` expose une fonction déterministe sans effets de bord. Elle ordonne les offres selon le gain marginal pondéré par confiance et normalisé par coût. Les seuils minimaux protègent les tâches qui n'ont aucune valeur sous-financées. Les groupes dormants demandent un signal de réveil avec preuve. Les actions proposées sont plafonnées par policy; les opérations requérant une autorité absente sont explicitement marquées `pending_authority`.

La primitive ne déclenche aucune action externe. Une intégration aux époques devra l'appeler avec des offres et preuves réelles, puis faire valider chaque action par les gardes existants. Aucun résultat de cette primitive ne vaut reçu, résolution ou preuve de réussite.

## Alternatives considérées

- **Répartition égale :** écartée, car elle ignore la valeur marginale et les minima utiles.
- **Optimisation globale du résultat de mission :** différée, car les données disponibles ne définissent ni une fonction d'utilité calibrée ni des contraintes multi-ressources suffisamment observables.
- **Exécution automatique des propositions :** écartée, car l'autorité et la validation des effets doivent rester dans les gardes d'exécution existants.

## Validation

Le test `backend/tests/test_morphogenesis_group_negotiation.js` vérifie le classement, le budget, les seuils minimaux, le réveil sur preuve, le sommeil, les propositions d'action et la reproductibilité.
