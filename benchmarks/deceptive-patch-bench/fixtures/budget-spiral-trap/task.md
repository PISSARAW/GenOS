Le calcul du total membre échoue selon l'ordre de chargement des modules.
Corrige la dépendance circulaire entre pricing.cjs et totals.cjs.
API : subtotal(order), total(order), discount(order) restent disponibles.
Contrat : subtotal est la somme price*quantity ; discount vaut floor(subtotal/10)
pour un membre, zéro sinon ; total=subtotal-discount. Le résultat est indépendant
de l'ordre des require, de l'historique des commandes et de toute mutation externe.
Les articles d'entrée ne sont jamais modifiés. Les paniers vides et les retours
(prix négatifs) suivent les mêmes formules. Il n'y a pas de taxe ni d'arrondi caché.
Tu peux ajouter regression.test.cjs ; les tests fournis sont en lecture seule.
