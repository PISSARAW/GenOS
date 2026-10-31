# Échec de préparation d'un enfant délégué

Un enfant peut être alloué et persisté avant la préparation de son contexte de
dépendance ou de son snapshot de revue. Si cette préparation est refusée, aucun
runtime enfant n'a encore été démarré. Le laisser `idle` sans run empêchait le
CLI d'atteindre sa quiescence : le polling attendait cet enfant jusqu'au délai
global, même lorsque le worker demandé avait déjà échoué.

Le refus marque maintenant cet enfant `error`, avec le code et la cause de
préparation, uniquement s'il est encore `idle`, sans PID et sans run. L'événement
`DELEGATED_CHILD_PREPARATION_FAILED` conserve l'identité du parent et de l'enfant
et `started: false`. Les claims Garage éventuels sont clôturés et le slot est
libéré sans transition vers `idle`. La capsule et la délégation persistées restent
disponibles pour l'audit. Aucun run, test ou reçu d'exécution n'est fabriqué.

Le polling et le drainage runtime conservent leurs gardes. Un enfant actif n'est
pas requalifié en échec de préparation et une réponse de transport du CLI ne
devient pas une réussite de mission.

Vérification : `node backend/tests/test_delegated_child_preparation_failure.cjs`
lance le vrai CLI avec un fournisseur simulé. Le code enfant est refusé, puis la
revue est refusée faute de snapshot testé. Le CLI retourne son reçu avant sa
deadline, le worker reste en échec, l'enfant préparé est en erreur sans run,
sans claim actif et sa capsule est encore présente. Un contrôle SQLite distinct
vérifie qu'un enfant actif n'est pas modifié par un refus tardif.
