# Plan statistique proposé

Le plan est préliminaire. Avant une exécution confirmatoire, figer protocole, corpus, versions, contrastes primaires, marge d'équivalence et calcul de puissance. Les cas sont appariés par identifiant et graine, avec trois répétitions prévues pour les quatre conditions principales.

| Donnée | Analyse proposée |
|---|---|
| Succès binaires appariés | McNemar ou régression logistique à effets mixtes |
| Coût, latence, consommation | Bootstrap apparié ou modèle mixte adapté |
| Plusieurs conditions | Contrastes préenregistrés avec modèle à effets mixtes |
| Erreurs rares | Intervalle binomial exact |
| Scalabilité | Régression log-log et analyse des ruptures |
| Équivalence sémantique | TOST avec marge fixée avant examen des résultats |

Appliquer Holm aux comparaisons multiples. Rapporter intervalles à 95 %, tailles d'effet et valeurs p. Les seuils zéro violation sont des conditions bloquantes sur les corpus exécutés, pas une preuve universelle d'absence de défaut. Les 50 cas par expérience de cette version ne suffisent pas à confirmer tous les seuils rares ou les volumes précisés dans le protocole source.
