# Addendum préconfirmatoire v3.6 — gabarit d'abstention C

Date : 2026-10-22, avant toute relance C contrôle.

La première relance des contrôles avec capture brute a montré une réponse `unresolved` mal formée, avec un tableau `uncertainties` corrompu. Le worker a échoué avant que l'oracle puisse mesurer une abstention. Le prompt C précise maintenant que, lorsque le WorkerSelf opérationnel n'est pas visible, le worker doit retourner exactement `{"outcome":"unresolved","claims":[],"uncertainties":["confidence_percent is not visible"]}` sans champ supplémentaire.

Le traitement, le seuil, les informations fournies et l'oracle restent inchangés. Les réponses de contrôle doivent toujours s'abstenir sans valeur numérique; les anciennes sorties mal formées restent des échecs.
