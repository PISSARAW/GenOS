# Réconciliation des étapes de workers

Chaque worker sélectionné ne contribue qu'une fois au compte terminal de son
étape. Une erreur de lancement et le statut `error` du même worker décrivent un
seul échec ; les identifiants servent à dédupliquer ces deux observations.

Les états `completed`, `blocked`, `failed` et `pending` sont calculés sur les
workers sélectionnés. Le nombre en attente est plafonné à zéro afin que la
télémétrie ne publie pas de valeur négative. Les workers dont le statut n'est
pas encore lisible restent en attente.

Vérification ciblée : `node backend/tests/test_worker_stage_reconciliation.js`.
